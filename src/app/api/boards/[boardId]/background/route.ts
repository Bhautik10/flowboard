import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { storeBoardBackground } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getBoardAccess, isResponse } from "@/lib/workspaces";

export const runtime = "nodejs";

const maxSize = 5 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const imageFileSchema = z.instanceof(File)
  .refine((file) => file.size > 0 && file.size <= maxSize, "Background image must be smaller than 5 MB")
  .refine((file) => Boolean(imageExtensions[file.type]), "Background image must be JPEG, PNG, or WebP");

export async function POST(
  request: Request,
  { params }: { params: { boardId: string } },
) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ error: "Only board admins can change the background" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const parsedFile = imageFileSchema.safeParse(form?.get("background"));
  if (!parsedFile.success) {
    if (form?.get("background") === null) {
      return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
    }
    return NextResponse.json({ error: parsedFile.error.issues[0]?.message ?? "Invalid image file" }, { status: 400 });
  }
  const file = parsedFile.data;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }
  const extension = imageExtensions[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Background image must be JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size < 1 || file.size > maxSize) {
    return NextResponse.json({ error: "Background image must be smaller than 5 MB" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const validSignature =
    (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (file.type === "image/png" &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.type === "image/webp" &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP");
  if (!validSignature) {
    return NextResponse.json({ error: "The selected file is not a valid image" }, { status: 400 });
  }

  const directory = process.env.FLOWBOARD_BOARD_BACKGROUND_DIR
    ? path.resolve(process.env.FLOWBOARD_BOARD_BACKGROUND_DIR)
    : path.join(process.cwd(), "uploads", "board-backgrounds");
  const fileName = `${access.userId}-${randomUUID()}${extension}`;
  const uploadedPath = path.join(directory, fileName);
  await storeBoardBackground(fileName, bytes, file.type, uploadedPath);
  const backgroundImage = `/api/board-backgrounds/${fileName}?boardId=${params.boardId}`;
  try {
    const board = await prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({
        where: { id: params.boardId },
        data: { backgroundImage },
      });
      await tx.activity.create({
        data: {
          boardId: params.boardId,
          actorId: access.userId,
          entityType: "BOARD",
          entityId: params.boardId,
          action: "BOARD_BACKGROUND_UPDATED",
          metadata: { backgroundImage },
        },
      });
      return updated;
    });
    return NextResponse.json({ board });
  } catch (error) {
    if (!process.env.S3_ENDPOINT) await unlink(uploadedPath).catch(() => undefined);
    throw error;
  }
}
