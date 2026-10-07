import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

const copySchema = z.object({ title: z.string().trim().min(1).max(200).optional() }).strict();

export async function POST(
  request: Request,
  { params }: { params: { cardId: string } },
) {
  const source = await prisma.card.findUnique({
    where: { id: params.cardId },
    include: {
      labels: { select: { labelId: true } },
      members: { select: { userId: true } },
      checklists: {
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!source) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(source.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot copy cards" }, { status: 403 });
  }
  const parsed = copySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const copy = await prisma.$transaction(async (tx) => {
    const lastCard = await tx.card.findFirst({
      where: { listId: source.listId, archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const card = await tx.card.create({
      data: {
        listId: source.listId,
        boardId: source.boardId,
        title: parsed.data.title ?? `${source.title} (copy)`.slice(0, 200),
        description: source.description,
        position: positionBetween(lastCard?.position ?? null, null),
        priority: source.priority,
        dueDate: source.dueDate,
        startDate: source.startDate,
        reminderAt: source.reminderAt,
        isComplete: false,
        coverType: source.coverType,
        coverValue: source.coverValue,
        estimatedHours: source.estimatedHours,
        labels: { create: source.labels.map(({ labelId }) => ({ label: { connect: { id: labelId } } })) },
        members: { create: source.members.map(({ userId }) => ({ user: { connect: { id: userId } } })) },
        checklists: {
          create: source.checklists.map((checklist) => ({
            title: checklist.title,
            position: checklist.position,
            items: {
              create: checklist.items.map((item) => ({
                text: item.text,
                isComplete: false,
                position: item.position,
              })),
            },
          })),
        },
      },
    });
    await tx.activity.create({
      data: {
        boardId: source.boardId,
        cardId: card.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: card.id,
        action: "CARD_COPIED",
        metadata: { sourceCardId: source.id },
      },
    });
    return card;
  });
  return NextResponse.json({ card: copy }, { status: 201 });
}
