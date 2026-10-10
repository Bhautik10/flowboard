import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { getBoardAccess, isResponse } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

const querySchema = z.object({ q: z.string().trim().min(2).max(100), page: z.coerce.number().int().min(1).max(100).default(1), limit: z.coerce.number().int().min(1).max(20).default(8) });

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { q, page, limit } = parsed.data; const skip = (page - 1) * limit;
    const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, select: { workspaceId: true, role: true } });
    const workspaceIds = memberships.map((item) => item.workspaceId); if (!workspaceIds.length) return NextResponse.json({ boards: [], cards: [], people: [], page, hasMore: false });
    const boards = await prisma.board.findMany({ where: { workspaceId: { in: workspaceIds }, archivedAt: null, title: { contains: q, mode: "insensitive" } }, select: { id: true, title: true, workspaceId: true, visibility: true, members: { where: { userId: user.id }, select: { userId: true } } }, take: 100 });
    const accessibleBoardIds: string[] = []; const boardResults = [];
    for (const board of boards) {
      const access = await getBoardAccess(board.id); if (isResponse(access)) continue;
      accessibleBoardIds.push(board.id); boardResults.push({ id: board.id, title: board.title, workspaceId: board.workspaceId, href: `/boards/${board.id}` });
    }
    const cardGroups = await Promise.all(accessibleBoardIds.map(async (boardId) => {
      const access = await getBoardAccess(boardId); if (isResponse(access)) return [];
      const results = await prisma.card.findMany({ where: { boardId, archivedAt: null, parentCardId: null, ...(access.role === "CLIENT" ? { visibility: "CLIENT_VISIBLE" as const } : {}), OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, select: { id: true, title: true, description: true, list: { select: { title: true } } }, take: limit * 2 });
      return results.map((card) => ({ ...card, boardId }));
    }));
    const cards = cardGroups.flat().slice(skip, skip + limit).map((card) => ({ id: card.id, title: card.title, description: card.description?.slice(0, 140) ?? "", list: card.list.title, boardId: card.boardId }));
    const peopleWorkspaceIds = memberships.filter((item) => item.role !== "CLIENT").map((item) => item.workspaceId);
    const people = peopleWorkspaceIds.length ? await prisma.workspaceMember.findMany({ where: { workspaceId: { in: peopleWorkspaceIds }, user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } }, select: { user: { select: { id: true, name: true, image: true } }, workspaceId: true }, distinct: ["userId"], take: limit, skip }) : [];
    return NextResponse.json({ boards: boardResults.slice(skip, skip + limit), cards, people: people.map(({ user: person, workspaceId }) => ({ ...person, workspaceId })), page, hasMore: boardResults.length > skip + limit || cardGroups.some((group) => group.length > skip + limit) || people.length === limit });
  } catch (error) {
    console.error("[search/get] Search failed", error);
    return NextResponse.json({ error: "Search could not be completed" }, { status: 500 });
  }
}
