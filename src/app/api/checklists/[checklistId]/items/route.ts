import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { createChecklistItemSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { checklistId: string } };

export async function POST(request: Request, { params }: Context) {
  const checklist = await prisma.checklist.findUnique({
    where: { id: params.checklistId },
    select: {
      id: true,
      cardId: true,
      card: { select: { boardId: true } },
      items: { orderBy: { position: "desc" }, take: 1, select: { position: true } },
    },
  });
  if (!checklist) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });
  const access = await getBoardAccess(checklist.card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot add checklist items" }, { status: 403 });
  }
  const parsed = createChecklistItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.checklistItem.create({
      data: {
        checklistId: checklist.id,
        text: parsed.data.text,
        position: positionBetween(checklist.items[0]?.position ?? null, null),
      },
    });
    await tx.activity.create({
      data: {
        boardId: checklist.card.boardId,
        cardId: checklist.cardId,
        actorId: access.userId,
        entityType: "CHECKLIST",
        entityId: checklist.id,
        action: "CHECKLIST_ITEM_ADDED",
        metadata: { itemId: created.id, text: created.text },
      },
    });
    return created;
  });
  return NextResponse.json({ item }, { status: 201 });
}
