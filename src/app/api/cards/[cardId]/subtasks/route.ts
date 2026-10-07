import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { createSubtaskSchema } from "@/lib/validations/card-details";

export async function POST(
  request: Request,
  { params }: { params: { cardId: string } },
) {
  const parent = await prisma.card.findUnique({
    where: { id: params.cardId },
    select: { id: true, boardId: true, listId: true },
  });
  if (!parent) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(parent.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot add subtasks" }, { status: 403 });
  }
  const parsed = createSubtaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const last = await prisma.card.findFirst({
    where: { listId: parent.listId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const subtask = await prisma.$transaction(async (tx) => {
    const created = await tx.card.create({
      data: {
        listId: parent.listId,
        boardId: parent.boardId,
        parentCardId: parent.id,
        title: parsed.data.title,
        position: positionBetween(last?.position ?? null, null),
      },
    });
    await tx.activity.create({
      data: {
        boardId: parent.boardId,
        cardId: parent.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: parent.id,
        action: "CARD_SUBTASK_ADDED",
        metadata: { subtaskId: created.id, title: created.title },
      },
    });
    await tx.activity.create({
      data: {
        boardId: parent.boardId,
        cardId: created.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: created.id,
        action: "CARD_CREATED",
        metadata: { parentCardId: parent.id, isSubtask: true },
      },
    });
    return created;
  });
  return NextResponse.json({ card: subtask }, { status: 201 });
}
