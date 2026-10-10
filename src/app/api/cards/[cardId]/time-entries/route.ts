import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { createTimeEntrySchema } from "@/lib/validations/time-tracking";

type Context = { params: { cardId: string } };

async function accessibleCard(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true, boardId: true, visibility: true } });
  if (!card) return { response: NextResponse.json({ error: "Card not found" }, { status: 404 }) };
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return { response: access };
  if (access.role === "CLIENT") return { response: NextResponse.json({ error: "Time tracking is not available to clients" }, { status: 404 }) };
  return { card, access };
}

export async function GET(_request: Request, { params }: Context) {
  const result = await accessibleCard(params.cardId);
  if ("response" in result) return result.response;
  try {
    const entries = await prisma.timeEntry.findMany({ where: { cardId: result.card.id, OR: [{ note: null }, { note: { not: { startsWith: "[Archived]" } } }] }, include: { user: { select: { id: true, name: true } } }, orderBy: { startedAt: "desc" } });
    const activeTimer = entries.find((entry) => entry.userId === result.access.userId && !entry.endedAt) ?? null;
    const totalSeconds = entries.reduce((sum, entry) => sum + (entry.durationSec ?? (entry.endedAt ? Math.max(0, Math.floor((entry.endedAt.getTime() - entry.startedAt.getTime()) / 1000)) : 0)), 0);
    return NextResponse.json({ entries, activeTimer: activeTimer ? { id: activeTimer.id, startedAt: activeTimer.startedAt } : null, totalSeconds, currentUserId: result.access.userId, canEdit: canEditContent(result.access.role) });
  } catch (error) {
    console.error("[time-entries/get] Could not load entries", { cardId: params.cardId, error });
    return NextResponse.json({ error: "Time entries could not be loaded" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const result = await accessibleCard(params.cardId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) return NextResponse.json({ error: "Viewers cannot change time entries" }, { status: 403 });
  const parsed = createTimeEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const entry = await prisma.$transaction(async (tx) => {
      if (parsed.data.action === "start") {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${result.access.userId}, 0))`;
        const running = await tx.timeEntry.findFirst({ where: { userId: result.access.userId, endedAt: null }, select: { cardId: true } });
        if (running) return null;
        const created = await tx.timeEntry.create({ data: { cardId: result.card.id, userId: result.access.userId, startedAt: new Date() } });
        await tx.activity.create({ data: { boardId: result.card.boardId, cardId: result.card.id, actorId: result.access.userId, entityType: "CARD", entityId: result.card.id, action: "TIME_ENTRY_STARTED" } });
        return created;
      }
      if (parsed.data.action === "stop") {
        const running = await tx.timeEntry.findFirst({ where: { cardId: result.card.id, userId: result.access.userId, endedAt: null }, orderBy: { startedAt: "desc" } });
        if (!running) throw new Error("No running timer for this card");
        const endedAt = new Date();
        const updated = await tx.timeEntry.update({ where: { id: running.id }, data: { endedAt, durationSec: Math.max(0, Math.floor((endedAt.getTime() - running.startedAt.getTime()) / 1000)) } });
        await tx.activity.create({ data: { boardId: result.card.boardId, cardId: result.card.id, actorId: result.access.userId, entityType: "CARD", entityId: result.card.id, action: "TIME_ENTRY_STOPPED" } });
        return updated;
      }
      const startedAt = new Date(parsed.data.startedAt); const endedAt = new Date(parsed.data.endedAt);
      const created = await tx.timeEntry.create({ data: { cardId: result.card.id, userId: result.access.userId, startedAt, endedAt, durationSec: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000), note: parsed.data.note || null } });
      await tx.activity.create({ data: { boardId: result.card.boardId, cardId: result.card.id, actorId: result.access.userId, entityType: "CARD", entityId: result.card.id, action: "TIME_ENTRY_CREATED" } });
      return created;
    });
    if (!entry) return NextResponse.json({ error: "You already have a running timer. Stop it before starting another." }, { status: 409 });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("[time-entries/create] Could not create or update timer", { cardId: params.cardId, error });
    const timerError = error instanceof Error && error.message === "No running timer for this card";
    return NextResponse.json({ error: timerError ? error.message : "Time entry could not be saved" }, { status: timerError ? 400 : 500 });
  }
}
