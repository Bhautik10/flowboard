import { NextResponse } from "next/server";
import { CardCoverType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { createCardSchema } from "@/lib/validations/workspaces";
import {
  canEditContent,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";

type Context = { params: { listId: string } };

export async function POST(request: Request, { params }: Context) {
  try {
    const list = await prisma.list.findUnique({
      where: { id: params.listId },
      select: { id: true, boardId: true },
    });
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
    const access = await getBoardAccess(list.boardId);
    if (isResponse(access)) return access;
    if (!canEditContent(access.role)) {
      return NextResponse.json({ error: "Viewers cannot add cards" }, { status: 403 });
    }
    const parsed = createCardSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const last = await prisma.card.findFirst({
      where: { listId: params.listId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const card = await prisma.card.create({
      data: {
        listId: params.listId,
        boardId: list.boardId,
        title: parsed.data.title,
        description: parsed.data.description,
        position: positionBetween(last?.position ?? null, null),
        priority: parsed.data.priority,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        reminderAt: parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null,
        isComplete: parsed.data.isComplete,
        completedAt: parsed.data.isComplete ? new Date() : null,
        coverType: parsed.data.coverValue ? CardCoverType.COLOR : CardCoverType.NONE,
        coverValue: parsed.data.coverValue,
      },
    });
    try {
      await prisma.activity.create({
        data: {
          boardId: list.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "CARD_CREATED",
          metadata: { listId: list.id, title: card.title },
        },
      });
    } catch (error) {
      console.error("[cards/create] Card was created but activity logging failed", error);
    }
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    console.error("[cards/create] Card creation failed", error);
    const message = error instanceof Error ? error.message : "Unknown card creation error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
