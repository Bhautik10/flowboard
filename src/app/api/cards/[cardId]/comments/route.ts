import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyMentionedMembers } from "@/lib/mentions";
import { canCommentCard } from "@/lib/workspaces";
import { commentVisibilitySchema } from "@/lib/validations/agency";
import { notifyCardSubscribers, notifyUsers } from "@/lib/notifications";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";

export async function POST(
  request: Request,
  { params }: { params: { cardId: string } },
) {
  try {
    const access = await getCardActorAccess(params.cardId);
    if (isCardActorResponse(access)) return access;
    if (!canCommentCard(access.role, access.cardVisibility)) {
      return NextResponse.json({ error: "You cannot comment on this card" }, { status: 403 });
    }
    const parsed = commentVisibilitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A non-empty comment body is required", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const isClient = access.role === "CLIENT";
    const visibleToClient = isClient || parsed.data.visibility === "CLIENT";
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          cardId: params.cardId,
          authorId: access.userId,
          authorLabel: null,
          body: parsed.data.body,
          visibility: visibleToClient ? "CLIENT" : "INTERNAL",
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
          reactions: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      await tx.activity.create({
        data: {
          boardId: access.board.id,
          cardId: params.cardId,
          actorId: access.userId,
          entityType: "COMMENT",
          entityId: created.id,
          action: "COMMENT_ADDED",
          metadata: { commentId: created.id },
        },
      });
      return created;
    });
    try {
      await notifyCardSubscribers({
        cardId: params.cardId,
        actorId: access.userId,
        eventType: "COMMENT",
        title: "New comment",
        body: "A card you follow or are assigned to received a comment.",
        clientVisibleActivity: comment.visibility === "CLIENT",
      });
      if (isClient) {
        const recipients = await prisma.workspaceMember.findMany({
          where: {
            workspaceId: access.board.workspaceId,
            userId: access.userId ? { not: access.userId } : undefined,
            role: { not: "CLIENT" },
          },
          select: { userId: true },
        });
        await notifyUsers({
          cardId: params.cardId,
          actorId: access.userId,
          eventType: "COMMENT",
          title: "New client comment",
          body: "A client commented on a shared card.",
          clientVisibleActivity: true,
          recipientIds: recipients.map(({ userId }) => userId),
        });
      }
    } catch (error) {
      console.error("[comments/create] Comment saved but notification delivery failed", { cardId: params.cardId, error });
    }
    if (!isClient && access.userId) {
      try {
        await notifyMentionedMembers({
          text: comment.body,
          cardId: params.cardId,
          workspaceId: access.board.workspaceId,
          actorId: access.userId,
          clientVisibleActivity: comment.visibility === "CLIENT",
        });
      } catch (error) {
        console.error("[comments/create] Comment was saved but mention notifications failed", error);
      }
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("[comments/create] Could not save card comment", { cardId: params.cardId, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save card comment" },
      { status: 500 },
    );
  }
}
