import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateChecklistItemSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { itemId: string } };

async function itemAccess(itemId: string) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      text: true,
      isComplete: true,
      checklistId: true,
      checklist: { select: { cardId: true, card: { select: { boardId: true } } } },
    },
  });
  if (!item) return { response: NextResponse.json({ error: "Checklist item not found" }, { status: 404 }) };
  const access = await getBoardAccess(item.checklist.card.boardId);
  if (isResponse(access)) return { response: access };
  if (!canEditContent(access.role)) {
    return { response: NextResponse.json({ error: "Viewers cannot edit checklist items" }, { status: 403 }) };
  }
  return { item, access };
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await itemAccess(params.itemId);
  if ("response" in result) return result.response;
  const parsed = updateChecklistItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const changes = Object.entries(parsed.data).filter(([key, value]) =>
    result.item[key as keyof typeof result.item] !== value,
  );
  if (!changes.length) return NextResponse.json({ success: true });
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.checklistItem.update({
      where: { id: result.item.id },
      data: parsed.data,
    });
    await Promise.all(changes.map(([field, value]) =>
      tx.activity.create({
        data: {
          boardId: result.item.checklist.card.boardId,
          cardId: result.item.checklist.cardId,
          actorId: result.access.userId,
          entityType: "CHECKLIST",
          entityId: result.item.checklistId,
          action: field === "isComplete" ? "CHECKLIST_ITEM_TOGGLED" : field === "position" ? "CHECKLIST_ITEM_REORDERED" : "CHECKLIST_ITEM_RENAMED",
          metadata: { itemId: result.item.id, field, value },
        },
      }),
    ));
    return updated;
  });
  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await itemAccess(params.itemId);
  if ("response" in result) return result.response;
  await prisma.$transaction(async (tx) => {
    await tx.checklistItem.delete({ where: { id: result.item.id } });
    await tx.activity.create({
      data: {
        boardId: result.item.checklist.card.boardId,
        cardId: result.item.checklist.cardId,
        actorId: result.access.userId,
        entityType: "CHECKLIST",
        entityId: result.item.checklistId,
        action: "CHECKLIST_ITEM_DELETED",
        metadata: { itemId: result.item.id, text: result.item.text },
      },
    });
  });
  return NextResponse.json({ success: true });
}
