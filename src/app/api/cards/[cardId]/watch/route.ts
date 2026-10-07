import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

const watchSchema = z.object({ watching: z.boolean() }).strict();

export async function PUT(
  request: Request,
  { params }: { params: { cardId: string } },
) {
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    select: { id: true, boardId: true },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot follow cards" }, { status: 403 });
  }
  const parsed = watchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.data.watching) {
      await tx.cardWatcher.upsert({
        where: { cardId_userId: { cardId: card.id, userId: access.userId } },
        create: { cardId: card.id, userId: access.userId },
        update: {},
      });
    } else {
      await tx.cardWatcher.deleteMany({
        where: { cardId: card.id, userId: access.userId },
      });
    }
    await tx.activity.create({
      data: {
        boardId: card.boardId,
        cardId: card.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: card.id,
        action: parsed.data.watching ? "CARD_WATCHED" : "CARD_UNWATCHED",
      },
    });
  });
  return NextResponse.json({ isWatching: parsed.data.watching });
}
