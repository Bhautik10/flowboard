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
    const access = await getCardActorAccess(params.cardId, request);
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
    const allClients = !isClient && (
      parsed.data.sharedWithAllClients === true ||
      (parsed.data.visibility === "CLIENT" && !parsed.data.clientKey)
    );
    let scopedClientKey = isClient ? access.clientKey : parsed.data.clientKey ?? null;
    if (!isClient && visibleToClient && !allClients && scopedClientKey) {
      const assigned = await prisma.cardClient.findFirst({
        where: { cardId: params.cardId, clientKey: scopedClientKey },
        select: { id: true },
      });
      if (!assigned) return NextResponse.json({ error: "Choose a client assigned to this card" }, { status: 400 });
    }
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          cardId: params.cardId,
          authorId: access.userId,
          authorLabel: access.actorLabel,
          body: parsed.data.body,
          visibility: visibleToClient ? "CLIENT" : "INTERNAL",
          clientKey: visibleToClient && !allClients ? scopedClientKey : null,
          sharedWithAllClients: visibleToClient && allClients,
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
          clientKey: created.clientKey,
          sharedWithAllClients: created.sharedWithAllClients,
          metadata: { commentId: created.id, clientKey: created.clientKey, sharedWithAllClients: created.sharedWithAllClients },
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
            userId: { not: access.userId },
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
    if (visibleToClient && !isClient) {
      try {
        const assignments = await prisma.cardClient.findMany({
          where: {
            cardId: params.cardId,
            userId: { not: null },
            ...(allClients ? {} : { clientKey: scopedClientKey! }),
          },
          select: { userId: true },
        });
        await notifyUsers({
          cardId: params.cardId,
          actorId: access.userId,
          recipientIds: assignments.flatMap(({ userId }) => userId ? [userId] : []),
          eventType: "COMMENT",
          title: "Team member commented on a shared card",
          body: "A team member added a client-visible comment.",
          clientVisibleActivity: true,
        });
      } catch (error) {
        console.error("[comments/create] Team comment saved but client notifications failed", { cardId: params.cardId, error });
      }
    }
    if (!isClient) {
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
