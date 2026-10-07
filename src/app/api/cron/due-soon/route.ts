import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret") ??
    "";
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const withinDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  try {
    const cards = await prisma.card.findMany({
      where: {
        dueDate: { gt: now, lte: withinDay },
        isComplete: false,
        archivedAt: null,
        parentCardId: null,
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        members: { select: { userId: true } },
        watchers: { select: { userId: true } },
      },
    });
    let queued = 0;
    for (const card of cards) {
      const dueAt = card.dueDate!.toISOString();
      const recipients = Array.from(new Set([
        ...card.members.map(({ userId }) => userId),
        ...card.watchers.map(({ userId }) => userId),
      ]));
      if (!recipients.length) continue;
      await notifyUsers({
        cardId: card.id,
        recipientIds: recipients,
        eventType: "DUE_SOON",
        title: "Card due soon",
        body: `"${card.title}" is due within 24 hours.`,
        clientVisibleActivity: true,
        dedupeKey: (recipientId) => `due-soon:${card.id}:${dueAt}:${recipientId}`,
      });
      queued += recipients.length;
    }
    return NextResponse.json({ cards: cards.length, recipients: queued });
  } catch (error) {
    console.error("[cron/due-soon] Could not process upcoming due dates", error);
    return NextResponse.json({ error: "Could not process due-soon notifications" }, { status: 500 });
  }
}
