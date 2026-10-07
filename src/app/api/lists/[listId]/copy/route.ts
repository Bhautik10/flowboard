import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import {
  canEditContent,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";

type Context = { params: { listId: string } };

export async function POST(_request: Request, { params }: Context) {
  const list = await prisma.list.findUnique({
    where: { id: params.listId },
    include: {
      cards: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: { title: true, description: true, priority: true, isComplete: true },
      },
      board: { select: { id: true } },
    },
  });
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  const access = await getBoardAccess(list.board.id);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot copy lists" }, { status: 403 });
  }
  const last = await prisma.list.findFirst({
    where: { boardId: list.board.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const copy = await prisma.list.create({
    data: {
      boardId: list.board.id,
      title: `${list.title} copy`,
      wipLimit: list.wipLimit,
      position: positionBetween(last?.position ?? null, null),
      cards: {
        create: list.cards.map((card, index) => ({
          ...card,
          boardId: list.board.id,
          position: positionBetween(index ? `n${"n".repeat(index - 1)}` : null, null),
        })),
      },
    },
  });
  return NextResponse.json({ list: copy }, { status: 201 });
}
