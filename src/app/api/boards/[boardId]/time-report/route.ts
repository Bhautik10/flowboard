import { NextResponse } from "next/server";
import { getBoardAccess, isResponse } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import { timeReportQuerySchema } from "@/lib/validations/time-tracking";

type Context = { params: { boardId: string } };
function weekStart(date: Date) { const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); }

export async function GET(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (access.role === "CLIENT") return NextResponse.json({ error: "Time reports are not available to clients" }, { status: 404 });
  const parsed = timeReportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const to = parsed.data.to ?? new Date(); const from = parsed.data.from ?? new Date(to.getTime() - 30 * 86400000);
  if (to.getTime() - from.getTime() > 366 * 86400000) return NextResponse.json({ error: "Select a date range of one year or less" }, { status: 400 });
  try {
    const entries = await prisma.timeEntry.findMany({ where: { card: { boardId: params.boardId }, OR: [{ note: null }, { note: { not: { startsWith: "[Archived]" } } }], startedAt: { gte: from, lte: to }, endedAt: { not: null } }, include: { card: { select: { id: true, title: true } }, user: { select: { id: true, name: true } } }, orderBy: { startedAt: "asc" } });
    const groups = new Map<string, { cardId: string; cardTitle: string; userId: string; userName: string; week: string; seconds: number }>();
    for (const entry of entries) {
      const key = `${entry.cardId}|${entry.userId}|${weekStart(entry.startedAt)}`;
      const group = groups.get(key) ?? { cardId: entry.cardId, cardTitle: entry.card.title, userId: entry.userId, userName: entry.user.name ?? "Member", week: weekStart(entry.startedAt), seconds: 0 };
      group.seconds += entry.durationSec ?? Math.max(0, Math.floor((entry.endedAt!.getTime() - entry.startedAt.getTime()) / 1000)); groups.set(key, group);
    }
    return NextResponse.json({ rows: Array.from(groups.values()).sort((a, b) => b.week.localeCompare(a.week)), from, to });
  } catch (error) {
    console.error("[time-report/get] Could not load board report", { boardId: params.boardId, error });
    return NextResponse.json({ error: "Time report could not be loaded" }, { status: 500 });
  }
}
