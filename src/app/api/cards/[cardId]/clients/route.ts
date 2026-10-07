import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cardClientShareSchema } from "@/lib/validations/agency";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { notifyUsers } from "@/lib/notifications";

type Context = { params: { cardId: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const card = await prisma.card.findUnique({
      where: { id: params.cardId },
      select: { id: true, boardId: true, visibility: true },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    const access = await getBoardAccess(card.boardId);
    if (isResponse(access)) return access;
    if (!canEditContent(access.role)) return NextResponse.json({ error: "Only team members can manage card sharing" }, { status: 403 });
    const [clients, assignments] = await Promise.all([
      prisma.boardMember.findMany({
        where: { boardId: card.boardId, role: "CLIENT" },
        select: { userId: true, user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.cardClient.findMany({
        where: { cardId: card.id },
        select: { clientKey: true, approvalStatus: true, revisionRound: true, userId: true, shareLinkId: true },
      }),
    ]);
    return NextResponse.json({
      clients: clients.map(({ user }) => ({
        ...user,
        clientKey: `user:${user.id}`,
        shared: assignments.some((assignment) => assignment.userId === user.id),
      })),
      assignments,
      visibility: card.visibility,
    });
  } catch (error) {
    console.error("[cards/clients] Could not load card client assignments", { cardId: params.cardId, error });
    return NextResponse.json({ error: "Could not load card sharing" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const card = await prisma.card.findUnique({
      where: { id: params.cardId },
      select: { id: true, boardId: true, visibility: true },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    const access = await getBoardAccess(card.boardId);
    if (isResponse(access)) return access;
    if (!canEditContent(access.role)) return NextResponse.json({ error: "Only team members can manage card sharing" }, { status: 403 });
    if (card.visibility !== "CLIENT_VISIBLE") {
      return NextResponse.json({ error: "Set the card to client-visible before sharing it" }, { status: 409 });
    }
    const parsed = cardClientShareSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const clientUserIds = Array.from(new Set(parsed.data.clientUserIds));
    const members = await prisma.boardMember.findMany({
      where: { boardId: card.boardId, role: "CLIENT", userId: { in: clientUserIds } },
      select: { userId: true },
    });
    if (members.length !== clientUserIds.length) {
      return NextResponse.json({ error: "Each selected client must be a client member of this board" }, { status: 400 });
    }
    const current = await prisma.cardClient.findMany({
      where: { cardId: card.id, userId: { not: null } },
      select: { clientKey: true },
    });
    const nextKeys = new Set(clientUserIds.map((userId) => `user:${userId}`));
    await prisma.$transaction(async (tx) => {
      await tx.cardClient.deleteMany({
        where: {
          cardId: card.id,
          userId: { not: null },
          clientKey: { notIn: Array.from(nextKeys) },
        },
      });
      for (const userId of clientUserIds) {
        await tx.cardClient.upsert({
          where: { cardId_clientKey: { cardId: card.id, clientKey: `user:${userId}` } },
          create: { cardId: card.id, clientKey: `user:${userId}`, userId },
          update: {},
        });
      }
      await tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_CLIENTS_UPDATED",
          metadata: { clientUserIds },
        },
      });
    });
    const added = clientUserIds.filter((userId) => !current.some(({ clientKey }) => clientKey === `user:${userId}`));
    for (const userId of added) {
      try {
        await notifyUsers({
          cardId: card.id,
          recipientIds: [userId],
          actorId: access.userId,
          eventType: "ASSIGNED",
          title: "A card was shared with you",
          body: "A team member shared a card with you.",
          clientVisibleActivity: true,
        });
      } catch (error) {
        console.error("[cards/clients] Sharing saved but client notification failed", { cardId: card.id, userId, error });
      }
    }
    return NextResponse.json({ clientUserIds, added });
  } catch (error) {
    console.error("[cards/clients] Could not update card client assignments", { cardId: params.cardId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update card sharing" }, { status: 500 });
  }
}
