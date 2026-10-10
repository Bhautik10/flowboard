import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { updateTimeEntrySchema } from "@/lib/validations/time-tracking";

type Context = { params: { cardId: string; entryId: string } };

async function authorizedEntry(cardId: string, entryId: string) {
  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, cardId, OR: [{ note: null }, { note: { not: { startsWith: "[Archived]" } } }] }, include: { card: { select: { id: true, boardId: true, visibility: true } } } });
  if (!entry) return { response: NextResponse.json({ error: "Time entry not found" }, { status: 404 }) };
  const access = await getBoardAccess(entry.card.boardId);
  if (isResponse(access)) return { response: access };
  if (access.role === "CLIENT") return { response: NextResponse.json({ error: "Time entry not found" }, { status: 404 }) };
  if (!canEditContent(access.role)) return { response: NextResponse.json({ error: "Viewers cannot edit time entries" }, { status: 403 }) };
  if (entry.userId !== access.userId) return { response: NextResponse.json({ error: "You may only change your own time entries" }, { status: 403 }) };
  return { entry, access };
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await authorizedEntry(params.cardId, params.entryId);
  if ("response" in result) return result.response;
  const parsed = updateTimeEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const startedAt = parsed.data.startedAt ? new Date(parsed.data.startedAt) : result.entry.startedAt;
  const endedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : result.entry.endedAt;
  if (endedAt && endedAt <= startedAt) return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  try {
    const entry = await prisma.$transaction(async (tx) => {
      const updated = await tx.timeEntry.update({ where: { id: result.entry.id }, data: { ...parsed.data, startedAt, endedAt, durationSec: endedAt ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000) : null } });
      await tx.activity.create({ data: { boardId: result.entry.card.boardId, cardId: result.entry.cardId, actorId: result.access.userId, entityType: "CARD", entityId: result.entry.cardId, action: "TIME_ENTRY_UPDATED", metadata: { entryId: result.entry.id } } });
      return updated;
    });
    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[time-entries/update] Could not update entry", { entryId: params.entryId, error });
    return NextResponse.json({ error: "Time entry could not be updated" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await authorizedEntry(params.cardId, params.entryId);
  if ("response" in result) return result.response;
  if (!result.entry.endedAt) return NextResponse.json({ error: "Stop a timer before archiving it" }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({ where: { id: result.entry.id }, data: { note: `[Archived]${result.entry.note ? ` ${result.entry.note}` : ""}` } });
      await tx.activity.create({ data: { boardId: result.entry.card.boardId, cardId: result.entry.cardId, actorId: result.access.userId, entityType: "CARD", entityId: result.entry.cardId, action: "TIME_ENTRY_ARCHIVED", metadata: { entryId: result.entry.id } } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[time-entries/archive] Could not archive entry", { entryId: params.entryId, error });
    return NextResponse.json({ error: "Time entry could not be archived" }, { status: 500 });
  }
}
