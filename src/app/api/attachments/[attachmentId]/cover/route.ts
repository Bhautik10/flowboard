import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

const coverSchema = z.object({ isCover: z.boolean() }).strict();

export async function PUT(
  request: Request,
  { params }: { params: { attachmentId: string } },
) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: params.attachmentId },
    select: { id: true, cardId: true, type: true, url: true },
  });
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  const card = await prisma.card.findUnique({
    where: { id: attachment.cardId },
    select: { id: true, boardId: true },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot change card covers" }, { status: 403 });
  }
  if (attachment.type !== "IMAGE") {
    return NextResponse.json({ error: "Only image attachments can be used as a cover" }, { status: 400 });
  }
  const parsed = coverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.attachment.updateMany({
      where: { cardId: card.id },
      data: { isCover: false },
    });
    await tx.attachment.update({
      where: { id: attachment.id },
      data: { isCover: parsed.data.isCover },
    });
    await tx.card.update({
      where: { id: card.id },
      data: parsed.data.isCover
        ? { coverType: "IMAGE", coverValue: `/api/attachments/${attachment.id}/file` }
        : { coverType: "NONE", coverValue: null },
    });
    await tx.activity.create({
      data: {
        boardId: card.boardId,
        cardId: card.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: card.id,
        action: parsed.data.isCover ? "ATTACHMENT_MADE_COVER" : "ATTACHMENT_REMOVED_AS_COVER",
        metadata: { attachmentId: attachment.id },
      },
    });
  });
  return NextResponse.json({ success: true, isCover: parsed.data.isCover });
}
