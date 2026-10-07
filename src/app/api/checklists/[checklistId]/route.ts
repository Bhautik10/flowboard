import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateChecklistSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { checklistId: string } };

async function checklistAccess(checklistId: string) {
  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { id: true, title: true, cardId: true, card: { select: { boardId: true } } },
  });
  if (!checklist) return { response: NextResponse.json({ error: "Checklist not found" }, { status: 404 }) };
  const access = await getBoardAccess(checklist.card.boardId);
  if (isResponse(access)) return { response: access };
  if (!canEditContent(access.role)) {
    return { response: NextResponse.json({ error: "Viewers cannot edit checklists" }, { status: 403 }) };
  }
  return { checklist, access };
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await checklistAccess(params.checklistId);
  if ("response" in result) return result.response;
  const parsed = updateChecklistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const checklist = await prisma.$transaction(async (tx) => {
    const updated = await tx.checklist.update({
      where: { id: result.checklist.id },
      data: { title: parsed.data.title },
    });
    await tx.activity.create({
      data: {
        boardId: result.checklist.card.boardId,
        cardId: result.checklist.cardId,
        actorId: result.access.userId,
        entityType: "CHECKLIST",
        entityId: updated.id,
        action: "CHECKLIST_RENAMED",
        metadata: { from: result.checklist.title, to: updated.title },
      },
    });
    return updated;
  });
  return NextResponse.json({ checklist });
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await checklistAccess(params.checklistId);
  if ("response" in result) return result.response;
  await prisma.$transaction(async (tx) => {
    await tx.checklist.delete({ where: { id: result.checklist.id } });
    await tx.activity.create({
      data: {
        boardId: result.checklist.card.boardId,
        cardId: result.checklist.cardId,
        actorId: result.access.userId,
        entityType: "CHECKLIST",
        entityId: result.checklist.id,
        action: "CHECKLIST_DELETED",
        metadata: { title: result.checklist.title },
      },
    });
  });
  return NextResponse.json({ success: true });
}
