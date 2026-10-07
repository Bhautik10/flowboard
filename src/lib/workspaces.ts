import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export { canCommentCard } from "@/lib/permissions";

export function slugBase(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "workspace"
  );
}

export async function ensureDefaultWorkspace(
  userId: string,
  name: string | null | undefined,
) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, role: WorkspaceRole.OWNER },
    select: { workspaceId: true },
  });
  if (membership) return membership.workspaceId;

  const workspaceName = `${name?.trim() || "My"}'s workspace`;
  const slug = `${slugBase(workspaceName)}-${crypto.randomUUID().slice(0, 8)}`;

  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      slug,
      members: { create: { userId, role: WorkspaceRole.OWNER } },
    },
    select: { id: true },
  });
  return workspace.id;
}

export type WorkspaceAccess = {
  userId: string;
  role: WorkspaceRole;
};

export async function getWorkspaceAccess(
  workspaceId: string,
): Promise<WorkspaceAccess | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (membership.role === WorkspaceRole.CLIENT) {
    return NextResponse.json({ error: "Clients cannot access workspace settings" }, { status: 404 });
  }
  return { userId: user.id, role: membership.role };
}

export async function getBoardAccess(
  boardId: string,
): Promise<(WorkspaceAccess & { board: { id: string; workspaceId: string; visibility: "PRIVATE" | "WORKSPACE" | "PUBLIC" } }) | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      workspaceId: true,
      visibility: true,
      members: {
        where: { userId: user.id },
        select: { id: true, role: true },
      },
      workspace: {
        select: {
          members: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      },
    },
  });
  const membership = board?.workspace.members[0];
  if (!board || !membership) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const boardMembership = board.members[0];
  if (membership.role === WorkspaceRole.CLIENT && boardMembership?.role !== "CLIENT") {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  if (
    board.visibility === "PRIVATE" &&
    !boardMembership &&
    membership.role !== WorkspaceRole.OWNER &&
    membership.role !== WorkspaceRole.ADMIN
  ) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const role =
    membership.role === WorkspaceRole.OWNER ||
    membership.role === WorkspaceRole.ADMIN
      ? membership.role
      : boardMembership?.role === "ADMIN"
        ? WorkspaceRole.ADMIN
        : boardMembership?.role === "OBSERVER"
          ? WorkspaceRole.VIEWER
          : boardMembership?.role === "CLIENT"
            ? WorkspaceRole.CLIENT
          : boardMembership?.role === "MEMBER"
            ? WorkspaceRole.MEMBER
            : membership.role;
  return {
    userId: user.id,
    role,
    board: {
      id: board.id,
      workspaceId: board.workspaceId,
      visibility: board.visibility,
    },
  };
}

export async function getCardCommentAccess(
  cardId: string,
): Promise<(WorkspaceAccess & {
  board: { id: string; workspaceId: string; visibility: "PRIVATE" | "WORKSPACE" | "PUBLIC" };
  cardVisibility: "INTERNAL" | "CLIENT_VISIBLE";
}) | NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const card = await prisma.card.findUnique({
    where: { id: cardId, archivedAt: null },
    select: {
      id: true,
      boardId: true,
      visibility: true,
      list: {
        select: {
          board: {
            select: {
              id: true,
              workspaceId: true,
              visibility: true,
              workspace: {
                select: { members: { where: { userId: user.id }, select: { role: true } } },
              },
            },
          },
        },
      },
    },
  });
  const board = card?.list.board;
  const membership = board?.workspace.members[0];
  if (!card || !membership) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  if (membership.role === WorkspaceRole.CLIENT) {
    if (card.visibility !== "CLIENT_VISIBLE") {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    return {
      userId: user.id,
      role: WorkspaceRole.CLIENT,
      board: {
        id: board.id,
        workspaceId: board.workspaceId,
        visibility: board.visibility,
      },
      cardVisibility: card.visibility,
    };
  }
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  return { ...access, cardVisibility: card.visibility };
}

export function isResponse(
  value: WorkspaceAccess | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

export function canEditContent(role: WorkspaceRole): boolean {
  return role !== WorkspaceRole.VIEWER && role !== WorkspaceRole.CLIENT;
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER;
}
