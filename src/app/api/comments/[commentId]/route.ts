import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractMentionedUserIds, notifyMentionedMembers } from "@/lib/mentions";
import { canEditContent, canManageWorkspace, getBoardAccess, isResponse } from "@/lib/workspaces";

const updateCommentSchema = z.object({ body: z.string().trim().min(1).max(10000) }).strict();
type Context = { params: { commentId: string } };

async function getAuthorizedComment(commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      body: true,
      visibility: true,
      authorId: true,
      cardId: true,
      card: { select: { boardId: true } },
    },
  });
  if (!comment) return { response: NextResponse.json({ error: "Comment not found" }, { status: 404 }) };
  const access = await getBoardAccess(comment.card.boardId);
  if (isResponse(access)) return { response: access };
  return { comment, access };
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await getAuthorizedComment(params.commentId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot edit comments" }, { status: 403 });
  }
  if (result.comment.authorId !== result.access.userId) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }
  const parsed = updateCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const comment = await prisma.$transaction(async (tx) => {
    const updated = await tx.comment.update({
      where: { id: result.comment.id },
      data: { body: parsed.data.body },
      include: {
        author: { select: { id: true, name: true, image: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    await tx.activity.create({
      data: {
        boardId: result.access.board.id,
        cardId: result.comment.cardId,
        actorId: result.access.userId,
        entityType: "COMMENT",
        entityId: result.comment.id,
        action: "COMMENT_EDITED",
      },
    });
    return updated;
  });
  try {
    await notifyMentionedMembers({
      text: comment.body,
      cardId: result.comment.cardId,
      workspaceId: result.access.board.workspaceId,
      actorId: result.access.userId,
      previouslyMentioned: extractMentionedUserIds(result.comment.body),
      clientVisibleActivity: result.comment.visibility === "CLIENT",
    });
  } catch (error) {
    console.error("[comments/update] Comment was saved but mention notifications failed", error);
  }
  return NextResponse.json({ comment });
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await getAuthorizedComment(params.commentId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot delete comments" }, { status: 403 });
  }
  if (
    result.comment.authorId !== result.access.userId &&
    !canManageWorkspace(result.access.role)
  ) {
    return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: {
        boardId: result.access.board.id,
        cardId: result.comment.cardId,
        actorId: result.access.userId,
        entityType: "COMMENT",
        entityId: result.comment.id,
        action: "COMMENT_DELETED",
        metadata: { authorId: result.comment.authorId },
      },
    });
    await tx.comment.delete({ where: { id: result.comment.id } });
  });
  return NextResponse.json({ success: true });
}
