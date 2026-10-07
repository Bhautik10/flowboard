import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { createWorkspaceSchema } from "@/lib/validations/workspaces";
import { slugBase } from "@/lib/workspaces";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const [memberships, preferences] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: user.id, workspace: { archivedAt: null } },
      include: {
        workspace: {
          include: {
            boards: {
                where: { archivedAt: null },
              orderBy: { createdAt: "asc" },
              include: {
                favorites: {
                  where: { userId: user.id },
                  select: { id: true },
                },
                members: {
                  where: { userId: user.id },
                  select: { id: true },
                },
                _count: { select: { lists: true } },
              },
            },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultWorkspaceId: true },
    }),
  ]);
  if (preferences?.defaultWorkspaceId) {
    memberships.sort(
      (left, right) =>
        Number(right.workspace.id === preferences.defaultWorkspaceId) -
        Number(left.workspace.id === preferences.defaultWorkspaceId),
    );
  }
  return NextResponse.json({
    workspaces: memberships.map(({ workspace, role }) => ({
      ...workspace,
      role,
      _count: role === WorkspaceRole.CLIENT ? undefined : workspace._count,
      boards: workspace.boards
        .filter(
          (board) =>
            role === WorkspaceRole.CLIENT
              ? board.members.some((member) => member.id)
              : board.visibility !== "PRIVATE" ||
                role === WorkspaceRole.OWNER ||
                role === WorkspaceRole.ADMIN ||
                board.members.length > 0,
        )
        .map((board) => ({
          ...board,
          isFavorite: board.favorites.length > 0,
          favorites: undefined,
          members: undefined,
        })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      slug: `${slugBase(parsed.data.name)}-${crypto.randomUUID().slice(0, 8)}`,
      members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
    },
  });
  return NextResponse.json({ workspace }, { status: 201 });
}
