import { NextResponse } from "next/server";
import { z } from "zod";
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

const moveListSchema = z.object({
  listId: z.string().cuid(),
  beforeListId: z.string().cuid().nullable(),
  afterListId: z.string().cuid().nullable(),
});

type Context = { params: { boardId: string } };

class MoveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function POST(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot move lists" }, { status: 403 });
  }
  const parsed = moveListSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { listId, beforeListId, afterListId } = parsed.data;
  if (beforeListId === listId || afterListId === listId) {
    return NextResponse.json(
      { error: "A list cannot be positioned relative to itself" },
      { status: 400 },
    );
  }
  if (beforeListId && beforeListId === afterListId) {
    return NextResponse.json({ error: "List neighbours must be different" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.list.findMany({
        where: { boardId: params.boardId, archivedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true, position: true },
      });
      const moving = rows.find((row) => row.id === listId);
      if (!moving) throw new MoveError("List not found", 404);
      const remaining = rows.filter((row) => row.id !== listId);
      const beforeIndex = beforeListId
        ? remaining.findIndex((row) => row.id === beforeListId)
        : -1;
      const afterIndex = afterListId
        ? remaining.findIndex((row) => row.id === afterListId)
        : -1;
      if (
        (beforeListId && beforeIndex < 0) ||
        (afterListId && afterIndex < 0) ||
        (!beforeListId && !afterListId && remaining.length > 0) ||
        (beforeListId && afterListId && afterIndex !== beforeIndex + 1) ||
        (!beforeListId && afterListId && afterIndex !== 0) ||
        (beforeListId && !afterListId && beforeIndex !== remaining.length - 1)
      ) {
        throw new MoveError("List drop position is out of date; refresh and try again", 409);
      }

      let ordered = remaining;
      let rebalanced: Array<{ id: string; position: string }> = [];
      if (positionsNeedRebalance(rows.map((row) => row.position))) {
        rebalanced = rebalancePositions(rows);
        const positions = new Map(rebalanced.map((entry) => [entry.id, entry.position]));
        ordered = remaining.map((row) => ({
          ...row,
          position: positions.get(row.id)!,
        }));
        for (const entry of rebalanced) {
          await tx.list.update({
            where: { id: entry.id },
            data: { position: entry.position },
          });
        }
      }

      const before = beforeListId
        ? ordered.find((row) => row.id === beforeListId)!.position
        : null;
      const after = afterListId
        ? ordered.find((row) => row.id === afterListId)!.position
        : null;
      const position = positionBetween(before, after);
      if (position.length > MAX_POSITION_LENGTH) {
        const updatedOrder = [
          ...ordered.slice(0, beforeIndex + 1),
          moving,
          ...ordered.slice(beforeIndex + 1),
        ];
        rebalanced = rebalancePositions(updatedOrder);
        for (const entry of rebalanced) {
          await tx.list.update({
            where: { id: entry.id },
            data: { position: entry.position },
          });
        }
        return {
          listId,
          position: rebalanced.find((entry) => entry.id === listId)!.position,
          rebalanced,
        };
      }

      await tx.list.update({ where: { id: listId }, data: { position } });
      const reportedPositions = rebalanced.length
        ? [
            ...rebalanced.filter((entry) => entry.id !== listId),
            { id: listId, position },
          ]
        : [];
      return { listId, position, rebalanced: reportedPositions };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MoveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
