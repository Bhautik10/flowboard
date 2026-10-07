import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cardLabelsSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { cardId: string } };

export async function PUT(request: Request, { params }: Context) {
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    select: { id: true, boardId: true, labels: { select: { labelId: true } } },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot change card labels" }, { status: 403 });
  }
  const parsed = cardLabelsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const labelIds = Array.from(new Set(parsed.data.labelIds));
  const labels = await prisma.label.findMany({
    where: { boardId: card.boardId, id: { in: labelIds } },
    select: { id: true },
  });
  if (labels.length !== labelIds.length) {
    return NextResponse.json({ error: "Labels must belong to this board" }, { status: 400 });
  }
  const currentIds = new Set(card.labels.map(({ labelId }) => labelId));
  const nextIds = new Set(labelIds);
  const added = labelIds.filter((id) => !currentIds.has(id));
  const removed = Array.from(currentIds).filter((id) => !nextIds.has(id));
  if (!added.length && !removed.length) return NextResponse.json({ success: true });

  await prisma.$transaction(async (tx) => {
    if (removed.length) {
      await tx.cardLabel.deleteMany({ where: { cardId: card.id, labelId: { in: removed } } });
    }
    if (added.length) {
      await tx.cardLabel.createMany({
        data: added.map((labelId) => ({ cardId: card.id, labelId })),
      });
    }
    await Promise.all([...added.map((labelId) =>
      tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_LABEL_ADDED",
          metadata: { labelId },
        },
      }),
    ), ...removed.map((labelId) =>
      tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_LABEL_REMOVED",
          metadata: { labelId },
        },
      }),
    )]);
  });
  return NextResponse.json({ success: true });
}
