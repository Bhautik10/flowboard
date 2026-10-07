import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

const reactionSchema = z.object({ emoji: z.string().trim().min(1).max(16) }).strict();

export async function POST(
  request: Request,
  { params }: { params: { commentId: string } },
) {
  const comment = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { id: true, cardId: true, card: { select: { boardId: true } } },
  });
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  const access = await getBoardAccess(comment.card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot react to comments" }, { status: 403 });
  }
  const parsed = reactionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const existing = await prisma.commentReaction.findUnique({
    where: {
      commentId_userId_emoji: {
        commentId: comment.id,
        userId: access.userId,
        emoji: parsed.data.emoji,
      },
    },
    select: { id: true },
  });
  const result = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.commentReaction.delete({ where: { id: existing.id } });
    } else {
      await tx.commentReaction.create({
        data: {
          commentId: comment.id,
          userId: access.userId,
          emoji: parsed.data.emoji,
        },
      });
    }
    await tx.activity.create({
      data: {
        boardId: comment.card.boardId,
        cardId: comment.cardId,
        actorId: access.userId,
        entityType: "COMMENT",
        entityId: comment.id,
        action: existing ? "COMMENT_REACTION_REMOVED" : "COMMENT_REACTION_ADDED",
        metadata: { emoji: parsed.data.emoji },
      },
    });
  });
  return NextResponse.json({ reacted: !existing, result });
}
