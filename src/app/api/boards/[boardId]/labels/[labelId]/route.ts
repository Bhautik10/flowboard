import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardLabelSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { boardId: string; labelId: string } };

async function checkLabel(boardId: string, labelId: string) {
  return prisma.label.findFirst({
    where: { id: labelId, boardId },
    select: { id: true, name: true, cards: { select: { cardId: true } } },
  });
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot edit labels" }, { status: 403 });
  }
  if (!(await checkLabel(params.boardId, params.labelId))) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }
  const parsed = boardLabelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const label = await prisma.$transaction(async (tx) => {
    const updated = await tx.label.update({
      where: { id: params.labelId },
      data: parsed.data,
    });
    await tx.activity.create({
      data: {
        boardId: params.boardId,
        actorId: access.userId,
        entityType: "BOARD",
        entityId: params.boardId,
        action: "BOARD_LABEL_UPDATED",
        metadata: { labelId: updated.id, name: updated.name },
      },
    });
    return updated;
  });
  return NextResponse.json({ label });
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot delete labels" }, { status: 403 });
  }
  const label = await checkLabel(params.boardId, params.labelId);
  if (!label) return NextResponse.json({ error: "Label not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await Promise.all(label.cards.map(({ cardId }) =>
      tx.activity.create({
        data: {
          boardId: params.boardId,
          cardId,
          actorId: access.userId,
          entityType: "CARD",
          entityId: cardId,
          action: "CARD_LABEL_REMOVED",
          metadata: { labelId: label.id, name: label.name, reason: "label deleted" },
        },
      }),
    ));
    await tx.label.delete({ where: { id: params.labelId } });
    await tx.activity.create({
      data: {
        boardId: params.boardId,
        actorId: access.userId,
        entityType: "BOARD",
        entityId: params.boardId,
        action: "BOARD_LABEL_DELETED",
        metadata: { labelId: label.id, name: label.name },
      },
    });
  });
  return NextResponse.json({ success: true });
}
