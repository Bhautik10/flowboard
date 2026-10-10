import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachmentStorageKey, deleteStoredAttachment } from "@/lib/storage";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/prisma-errors";

type Context = { params: { attachmentId: string } };

async function authorizedAttachment(attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, cardId: true, type: true, url: true, isCover: true, name: true },
  });
  if (!attachment) return { response: NextResponse.json({ error: "Attachment not found" }, { status: 404 }) };
  const card = await prisma.card.findUnique({
    where: { id: attachment.cardId },
    select: { boardId: true, visibility: true },
  });
  if (!card) return { response: NextResponse.json({ error: "Attachment not found" }, { status: 404 }) };
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return { response: access };
  if (access.role === "CLIENT") {
    if (card.visibility !== "CLIENT_VISIBLE") return { response: NextResponse.json({ error: "Attachment not found" }, { status: 404 }) };
    try {
      const share = await prisma.cardClient.findUnique({ where: { cardId_clientUserId: { cardId: attachment.cardId, clientUserId: access.userId } }, select: { id: true } });
      if (!share) return { response: NextResponse.json({ error: "Attachment not found" }, { status: 404 }) };
    } catch (error) {
      if (isMissingTableError(error, "CardClient")) return { response: NextResponse.json({ error: "Client card sharing is not available until the database migration is applied." }, { status: 503 }) };
      throw error;
    }
  }
  return { attachment, card, access };
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await authorizedAttachment(params.attachmentId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot delete attachments" }, { status: 403 });
  }
  const key = attachmentStorageKey(result.attachment.url);
  await prisma.$transaction(async (tx) => {
    if (result.attachment.isCover) {
      await tx.card.update({
        where: { id: result.attachment.cardId },
        data: { coverType: "NONE", coverValue: null },
      });
    }
    await tx.activity.create({
      data: {
        boardId: result.card.boardId,
        cardId: result.attachment.cardId,
        actorId: result.access.userId,
        entityType: "CARD",
        entityId: result.attachment.cardId,
        action: "ATTACHMENT_DELETED",
        metadata: { attachmentId: result.attachment.id, name: result.attachment.name },
      },
    });
    await tx.attachment.delete({ where: { id: result.attachment.id } });
  });
  if (key) {
    try {
      await deleteStoredAttachment(key);
    } catch (error) {
      console.error("[attachments/delete] Attachment row was deleted but stored object cleanup failed", error);
    }
  }
  return NextResponse.json({ success: true });
}
