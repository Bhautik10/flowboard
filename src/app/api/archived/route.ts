import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const membership = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true, role: true },
  });
  const workspaceIds = membership
    .filter((item) => item.role !== WorkspaceRole.CLIENT)
    .map((item) => item.workspaceId);
  const [boards, lists, cards] = await Promise.all([
    prisma.board.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        archivedAt: { not: null },
        OR: [
          { visibility: { not: "PRIVATE" } },
          { members: { some: { userId: user.id } } },
          {
            workspace: {
              members: {
                some: {
                  userId: user.id,
                  role: { in: ["OWNER", "ADMIN"] },
                },
              },
            },
          },
        ],
      },
      select: { id: true, title: true, archivedAt: true, workspace: { select: { name: true } } },
      orderBy: { archivedAt: "desc" },
    }),
    prisma.list.findMany({
      where: {
        archivedAt: { not: null },
        board: {
          workspaceId: { in: workspaceIds },
          archivedAt: null,
          OR: [
            { visibility: { not: "PRIVATE" } },
            { members: { some: { userId: user.id } } },
            {
              workspace: {
                members: {
                  some: {
                    userId: user.id,
                    role: { in: ["OWNER", "ADMIN"] },
                  },
                },
              },
            },
          ],
        },
      },
      select: { id: true, title: true, archivedAt: true, board: { select: { id: true, title: true } } },
      orderBy: { archivedAt: "desc" },
    }),
    prisma.card.findMany({
      where: {
        archivedAt: { not: null },
        list: {
          archivedAt: null,
          board: {
          workspaceId: { in: workspaceIds },
          archivedAt: null,
          OR: [
            { visibility: { not: "PRIVATE" } },
            { members: { some: { userId: user.id } } },
            {
              workspace: {
                members: {
                  some: {
                    userId: user.id,
                    role: { in: ["OWNER", "ADMIN"] },
                  },
                },
              },
            },
          ],
          },
        },
      },
      select: {
        id: true,
        title: true,
        archivedAt: true,
        list: {
          select: {
            title: true,
            board: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { archivedAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    boards,
    lists,
    cards: cards.map(({ list, ...card }) => ({
      ...card,
      list: { title: list.title },
      board: list.board,
    })),
  });
}
