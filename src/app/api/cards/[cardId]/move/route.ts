import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import {
  MAX_POSITION_LENGTH,
  positionBetween,
  positionsNeedRebalance,
  rebalancePositions,
} from "@/lib/position";
import {
  canEditContent,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";

const moveCardSchema = z.object({
  boardId: z.string().cuid().optional(),
  listId: z.string().cuid(),
  beforeCardId: z.string().cuid().nullable(),
  afterCardId: z.string().cuid().nullable(),
});

type Context = { params: { cardId: string } };

class MoveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = moveCardSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    select: { id: true, boardId: true, listId: true, archivedAt: true },
  });
  if (!card || card.archivedAt) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot move cards" }, { status: 403 });
  }
  const targetBoardId = parsed.data.boardId ?? card.boardId;
  const targetAccess =
    targetBoardId === card.boardId
      ? access
      : await getBoardAccess(targetBoardId);
  if (isResponse(targetAccess)) return targetAccess;
  if (!canEditContent(targetAccess.role)) {
    return NextResponse.json({ error: "Viewers cannot move cards to this board" }, { status: 403 });
  }
  if (
    parsed.data.beforeCardId === params.cardId ||
    parsed.data.afterCardId === params.cardId ||
    (parsed.data.beforeCardId &&
      parsed.data.beforeCardId === parsed.data.afterCardId)
  ) {
    return NextResponse.json({ error: "Invalid card neighbours" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetList = await tx.list.findFirst({
        where: { id: parsed.data.listId, boardId: targetBoardId, archivedAt: null },
        select: { id: true, title: true, wipLimit: true },
      });
      if (!targetList) throw new MoveError("Target list not found", 404);
      const currentCard = await tx.card.findUnique({
        where: { id: card.id },
        select: { id: true, listId: true, archivedAt: true },
      });
      if (!currentCard || currentCard.archivedAt) {
        throw new MoveError("Card not found", 404);
      }

      const targetCards = await tx.card.findMany({
        where: { listId: targetList.id, archivedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true, position: true },
      });
      const sameList = currentCard.listId === targetList.id && targetBoardId === card.boardId;
      let sourceRebalanced: Array<{ id: string; position: string }> = [];
      if (!sameList) {
        const sourceCards = await tx.card.findMany({
          where: {
            listId: currentCard.listId,
            archivedAt: null,
            id: { not: currentCard.id },
          },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true, position: true },
        });
        if (positionsNeedRebalance(sourceCards.map((item) => item.position))) {
          sourceRebalanced = rebalancePositions(sourceCards);
          for (const entry of sourceRebalanced) {
            await tx.card.update({
              where: { id: entry.id },
              data: { position: entry.position },
            });
          }
        }
      }
      const remaining = targetCards.filter((item) => item.id !== params.cardId);
      if (!sameList && targetList.wipLimit !== null && remaining.length >= targetList.wipLimit) {
        throw new MoveError("This list has reached its WIP limit", 409);
      }

      const beforeId = parsed.data.beforeCardId;
      const afterId = parsed.data.afterCardId;
      const beforeIndex = beforeId
        ? remaining.findIndex((item) => item.id === beforeId)
        : -1;
      const afterIndex = afterId
        ? remaining.findIndex((item) => item.id === afterId)
        : -1;
      if (
        (beforeId && beforeIndex < 0) ||
        (afterId && afterIndex < 0) ||
        (!beforeId && !afterId && remaining.length > 0) ||
        (beforeId && afterId && afterIndex !== beforeIndex + 1) ||
        (!beforeId && afterId && afterIndex !== 0) ||
        (beforeId && !afterId && beforeIndex !== remaining.length - 1)
      ) {
        throw new MoveError(
          "Card drop position is out of date; refresh and try again",
          409,
        );
      }

      let ordered = remaining;
      let rebalanced: Array<{ id: string; position: string }> = [];
      if (positionsNeedRebalance(targetCards.map((item) => item.position))) {
        rebalanced = rebalancePositions(targetCards);
        const positions = new Map(rebalanced.map((entry) => [entry.id, entry.position]));
        ordered = remaining.map((item) => ({
          ...item,
          position: positions.get(item.id)!,
        }));
        for (const entry of rebalanced) {
          await tx.card.update({
            where: { id: entry.id },
            data: { position: entry.position },
          });
        }
      }

      const before = beforeId
        ? ordered.find((item) => item.id === beforeId)!.position
        : null;
      const after = afterId
        ? ordered.find((item) => item.id === afterId)!.position
        : null;
      const position = positionBetween(before, after);
      if (position.length > MAX_POSITION_LENGTH) {
        const reordered = [
          ...ordered.slice(0, beforeIndex + 1),
          { id: card.id, position },
          ...ordered.slice(beforeIndex + 1),
        ];
        rebalanced = rebalancePositions(reordered);
        for (const entry of rebalanced) {
          if (entry.id !== card.id) {
            await tx.card.update({
              where: { id: entry.id },
              data: { position: entry.position },
            });
          }
        }
        const finalPosition = rebalanced.find((entry) => entry.id === card.id)!.position;
        await tx.card.update({
          where: { id: card.id },
          data: { listId: targetList.id, boardId: targetBoardId, position: finalPosition },
        });
        if (targetBoardId !== card.boardId) {
          await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
        }
        await tx.activity.create({
          data: {
            actorId: access.userId,
            boardId: targetBoardId,
            cardId: card.id,
            entityType: "CARD",
            entityId: card.id,
            action: "CARD_MOVED",
            metadata: {
              fromListId: currentCard.listId,
              toListId: targetList.id,
              fromBoardId: card.boardId,
              toBoardId: targetBoardId,
            },
          },
        });
        return {
          cardId: card.id,
          listId: targetList.id,
          position: finalPosition,
          rebalanced: [
            ...sourceRebalanced.map((entry) => ({
              ...entry,
              listId: currentCard.listId,
            })),
            ...rebalanced.map((entry) => ({ ...entry, listId: targetList.id })),
          ],
        };
      }

      await tx.card.update({
        where: { id: card.id },
        data: { listId: targetList.id, boardId: targetBoardId, position },
      });
      if (targetBoardId !== card.boardId) {
        await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
      }
      await tx.activity.create({
        data: {
          actorId: access.userId,
          boardId: targetBoardId,
          cardId: card.id,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_MOVED",
          metadata: {
            fromListId: currentCard.listId,
            toListId: targetList.id,
            fromBoardId: card.boardId,
            toBoardId: targetBoardId,
          },
        },
      });
      const reportedPositions = rebalanced.length
        ? [
            ...rebalanced
              .filter((entry) => entry.id !== card.id)
              .map((entry) => ({ ...entry, listId: targetList.id })),
            { id: card.id, position, listId: targetList.id },
          ]
        : sourceRebalanced.map((entry) => ({
            ...entry,
            listId: currentCard.listId,
          }));
      if (rebalanced.length) {
        reportedPositions.unshift(
          ...sourceRebalanced.map((entry) => ({
            ...entry,
            listId: currentCard.listId,
          })),
        );
      }
      return {
        cardId: card.id,
        listId: targetList.id,
        position,
        rebalanced: reportedPositions,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MoveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
