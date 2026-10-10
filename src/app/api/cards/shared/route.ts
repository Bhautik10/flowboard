import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { isMissingTableError } from "@/lib/prisma-errors";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id, role: "CLIENT" }, select: { id: true } });
    if (!membership) return NextResponse.json({ error: "Client access required" }, { status: 403 });
    const shares = await prisma.cardClient.findMany({
      where: { clientUserId: user.id, card: { archivedAt: null, visibility: "CLIENT_VISIBLE" } },
      select: { card: { select: { id: true, title: true, dueDate: true, approvalStatus: true, boardId: true, list: { select: { title: true, board: { select: { title: true, backgroundColor: true } } } } } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ cards: shares.map(({ card }) => card) });
  } catch (error) { if (isMissingTableError(error, "CardClient")) return NextResponse.json({ error: "Card sharing is not available until the database migration is applied." }, { status: 503 }); console.error("[cards/shared:get]", error); return NextResponse.json({ error: "Shared cards could not be loaded" }, { status: 500 }); }
}
