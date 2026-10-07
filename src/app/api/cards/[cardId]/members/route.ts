import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cardMembersSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { notifyUsers } from "@/lib/notifications";

type Context = { params: { cardId: string } };

export async function PUT(request: Request, { params }: Context) {
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    select: { id: true, boardId: true, members: { select: { userId: true } } },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot assign card members" }, { status: 403 });
  }
  const parsed = cardMembersSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const userIds = Array.from(new Set(parsed.data.userIds));
  const boardMembers = await prisma.boardMember.findMany({
    where: { boardId: card.boardId, userId: { in: userIds } },
    select: { userId: true },
  });
  if (boardMembers.length !== userIds.length) {
    return NextResponse.json({ error: "All assignees must be board members" }, { status: 400 });
  }
  const currentIds = new Set(card.members.map(({ userId }) => userId));
  const nextIds = new Set(userIds);
  const added = userIds.filter((id) => !currentIds.has(id));
  const removed = Array.from(currentIds).filter((id) => !nextIds.has(id));
  if (!added.length && !removed.length) return NextResponse.json({ success: true });

  await prisma.$transaction(async (tx) => {
    if (removed.length) {
      await tx.cardMember.deleteMany({
        where: { cardId: card.id, userId: { in: removed } },
      });
    }
    if (added.length) {
      await tx.cardMember.createMany({
        data: added.map((userId) => ({ cardId: card.id, userId })),
      });
    }
    await Promise.all([...added.map((userId) =>
      tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_MEMBER_ASSIGNED",
          metadata: { userId },
        },
      }),
    ), ...removed.map((userId) =>
      tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_MEMBER_UNASSIGNED",
          metadata: { userId },
        },
      }),
    )]);
  });
  for (const userId of added) {
    try {
      await notifyUsers({
        cardId: card.id,
        recipientIds: [userId],
        actorId: access.userId,
        eventType: "ASSIGNED",
        title: "You were assigned to a card",
        body: "You were assigned to a card.",
        clientVisibleActivity: true,
      });
    } catch (error) {
      console.error("[cards/members] Assignment saved but notification failed", { cardId: card.id, userId, error });
    }
  }
  return NextResponse.json({ success: true });
}
