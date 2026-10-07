import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { createChecklistSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { cardId: string } };

export async function POST(request: Request, { params }: Context) {
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    select: { id: true, boardId: true },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot create checklists" }, { status: 403 });
  }
  const parsed = createChecklistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const last = await prisma.checklist.findFirst({
    where: { cardId: card.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const checklist = await prisma.$transaction(async (tx) => {
    const created = await tx.checklist.create({
      data: {
        cardId: card.id,
        title: parsed.data.title,
        position: positionBetween(last?.position ?? null, null),
      },
    });
    await tx.activity.create({
      data: {
        boardId: card.boardId,
        cardId: card.id,
        actorId: access.userId,
        entityType: "CHECKLIST",
        entityId: created.id,
        action: "CHECKLIST_CREATED",
        metadata: { title: created.title },
      },
    });
    return created;
  });
  return NextResponse.json({ checklist }, { status: 201 });
}
