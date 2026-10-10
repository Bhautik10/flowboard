import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBoardAccess, isResponse } from "@/lib/workspaces";
import { isMissingTableError } from "@/lib/prisma-errors";

export async function getCardActorAccess(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId, archivedAt: null },
    select: { id: true, boardId: true, visibility: true },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (access.role === "CLIENT") {
    if (card.visibility !== "CLIENT_VISIBLE") return NextResponse.json({ error: "Card not found" }, { status: 404 });
    try {
      const share = await prisma.cardClient.findUnique({
        where: { cardId_clientUserId: { cardId: card.id, clientUserId: access.userId } },
        select: { id: true },
      });
      if (!share) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    } catch (error) {
      if (isMissingTableError(error, "CardClient")) return NextResponse.json({ error: "Card sharing is not available until the database migration is applied." }, { status: 503 });
      throw error;
    }
  }
  return { ...access, cardVisibility: card.visibility };
}

export function isCardActorResponse(value: Awaited<ReturnType<typeof getCardActorAccess>>): value is NextResponse {
  return value instanceof NextResponse;
}
