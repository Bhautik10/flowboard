import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { itemId: string } };

export async function POST(_request: Request, { params }: Context) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: params.itemId },
    select: {
      id: true,
      text: true,
      checklistId: true,
      checklist: {
        select: {
          cardId: true,
          card: { select: { id: true, boardId: true, listId: true } },
        },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
  const access = await getBoardAccess(item.checklist.card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot convert checklist items" }, { status: 403 });
  }
  const last = await prisma.card.findFirst({
    where: { listId: item.checklist.card.listId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const result = await prisma.$transaction(async (tx) => {
    const card = await tx.card.create({
      data: {
        listId: item.checklist.card.listId,
        boardId: item.checklist.card.boardId,
        title: item.text,
        position: positionBetween(last?.position ?? null, null),
      },
    });
    await tx.checklistItem.delete({ where: { id: item.id } });
    await tx.activity.create({
      data: {
        boardId: item.checklist.card.boardId,
        cardId: item.checklist.cardId,
        actorId: access.userId,
        entityType: "CHECKLIST",
        entityId: item.checklistId,
        action: "CHECKLIST_ITEM_CONVERTED_TO_CARD",
        metadata: { itemId: item.id, createdCardId: card.id },
      },
    });
    await tx.activity.create({
      data: {
        boardId: item.checklist.card.boardId,
        cardId: card.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: card.id,
        action: "CARD_CREATED_FROM_CHECKLIST",
        metadata: { sourceCardId: item.checklist.cardId, checklistItemId: item.id },
      },
    });
    return card;
  });
  return NextResponse.json({ card: result }, { status: 201 });
}
