import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAttachmentUrl, readStoredAttachment } from "@/lib/storage";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { attachmentId: string } },
) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: params.attachmentId },
    select: { id: true, cardId: true, url: true, mimeType: true, name: true },
  });
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  const access = await getCardActorAccess(attachment.cardId);
  if (isCardActorResponse(access)) return access;

  if (attachment.mimeType === "text/uri-list") {
    return NextResponse.json({ error: "Link attachments open at their saved URL" }, { status: 400 });
  }
  const isS3 = Boolean(process.env.S3_ENDPOINT);
  if (isS3) return NextResponse.redirect(await getAttachmentUrl(attachment.url));
  try {
    const bytes = await readStoredAttachment(attachment.url);
    const mimeType = attachment.mimeType ?? "application/octet-stream";
    const inline = mimeType.startsWith("image/") || mimeType === "application/pdf";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.name.replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[attachments/file] Stored attachment could not be read", error);
    return NextResponse.json({ error: "Attachment file could not be read" }, { status: 500 });
  }
}
