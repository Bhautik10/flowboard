import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const cards = await prisma.card.findMany({
    where: {
      archivedAt: null,
      members: { some: { userId: user.id } },
      OR: [
        {
          list: {
            board: {
              members: { none: { userId: user.id, role: "CLIENT" } },
              workspace: { members: { some: { userId: user.id, role: { not: "CLIENT" } } } },
            },
          },
        },
        {
          visibility: "CLIENT_VISIBLE",
          list: {
            board: {
              members: { some: { userId: user.id, role: "CLIENT" } },
            },
          },
        },
      ],
      list: {
        board: {
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
          workspace: { members: { some: { userId: user.id } } },
        },
      },
    },
    include: {
      list: {
        select: {
          id: true,
          title: true,
          board: {
            select: {
              id: true,
              title: true,
              backgroundColor: true,
              members: { where: { userId: user.id }, select: { role: true } },
              workspace: {
                select: { members: { where: { userId: user.id }, select: { role: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    cards: cards.map(({ list, ...card }) => {
      const clientScoped =
        list.board.members.some((member) => member.role === "CLIENT") &&
        !list.board.workspace.members.some((member) => member.role === "OWNER" || member.role === "ADMIN");
      const board = {
        id: list.board.id,
        title: list.board.title,
        backgroundColor: list.board.backgroundColor,
      };
      return {
        ...card,
        estimatedHours: clientScoped ? null : card.estimatedHours,
        list: { id: list.id, title: list.title },
        board,
      };
    }),
  });
}
