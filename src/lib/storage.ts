import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const maxAttachmentSize = 10 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};
const uploadFileSchema = z.custom<File>((value): value is File =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  "type" in value &&
  "size" in value &&
  typeof Reflect.get(value, "arrayBuffer") === "function",
);
const attachmentFileSchema = uploadFileSchema
  .refine((file) => file.size > 0 && file.size <= maxAttachmentSize, "Attachment must be between 1 byte and 10 MB")
  .refine((file) => Object.hasOwn(extensions, file.type), "Only JPEG, PNG, WebP images and PDF files are supported");

export type UploadedAttachment = {
  key: string;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  type: "IMAGE" | "FILE";
};

export class AttachmentValidationError extends Error {}

export function isUploadFile(value: FormDataEntryValue | null | undefined): value is File {
  return uploadFileSchema.safeParse(value).success;
}

function s3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const configured = [endpoint, region, bucket, accessKeyId, secretAccessKey].filter(Boolean).length;
  if (configured > 0 && configured < 5) {
    throw new Error("S3 storage requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY");
  }
  if (configured === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("S3 storage must be configured in production; local attachment storage is development-only");
    }
    return null;
  }
  return { endpoint: endpoint!, region: region!, bucket: bucket!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! };
}

function client() {
  const config = s3Config();
  if (!config) return null;
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

function localDirectory() {
  return path.join(process.cwd(), "public", "uploads");
}

export function sanitizeFileName(value: string) {
  const base = path.basename(value.replace(/\\/g, "/"));
  const safe = base
    .normalize("NFKD")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 120);
  return safe || "attachment";
}

function validSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  if (mimeType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}

export async function validateAndStoreFile(file: File): Promise<UploadedAttachment> {
  const parsedFile = attachmentFileSchema.safeParse(file);
  if (!parsedFile.success) {
    throw new AttachmentValidationError(parsedFile.error.issues[0]?.message ?? "Invalid attachment");
  }
  const extension = extensions[file.type];
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validSignature(bytes, file.type)) throw new AttachmentValidationError("The selected file content does not match its file type");

  const name = sanitizeFileName(file.name);
  const key = `${randomUUID()}${extension}`;
  const storage = client();
  if (storage) {
    const config = s3Config()!;
    await storage.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bytes,
      ContentType: file.type,
      ContentLength: bytes.length,
    }));
  } else {
    await mkdir(localDirectory(), { recursive: true });
    await writeFile(path.join(localDirectory(), key), bytes, { flag: "wx" });
  }
  return {
    key,
    url: `/api/attachments/${key}/file`,
    name,
    mimeType: file.type,
    sizeBytes: bytes.length,
    type: file.type.startsWith("image/") ? "IMAGE" : "FILE",
  };
}

export async function getAttachmentUrl(key: string) {
  const storage = client();
  if (!storage) return `/uploads/${encodeURIComponent(path.basename(key))}`;
  const config = s3Config()!;
  if (process.env.S3_PUBLIC_URL) {
    return `${process.env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;
  }
  return getSignedUrl(storage, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: 3600 });
}

export async function readStoredAttachment(key: string) {
  const storage = client();
  if (!storage) return readFile(path.join(localDirectory(), path.basename(key)));
  const config = s3Config()!;
  const response = await storage.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!response.Body) throw new Error("Attachment storage returned an empty file");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deleteStoredAttachment(key: string) {
  const storage = client();
  if (!storage) {
    await unlink(path.join(localDirectory(), path.basename(key)));
    return;
  }
  const config = s3Config()!;
  await storage.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export function attachmentStorageKey(key: string) {
  return /^[a-f0-9-]{36}\.(?:jpg|png|webp|pdf)$/.test(key) ? key : null;
}

export function getAttachmentMaxSize() {
  return maxAttachmentSize;
}
