import { NextResponse } from "next/server";
import { BoardMemberRole, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canManageWorkspace,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";
import { boardMemberRoleSchema } from "@/lib/validations/workspaces";
import { z } from "zod";

type Context = { params: { boardId: string } };
const removeSchema = z.object({ userId: z.string().cuid() });

export async function GET(_request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can manage board roles" }, { status: 403 });
  }
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: access.board.workspaceId },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });
  const boardMembers = await prisma.boardMember.findMany({
    where: { boardId: params.boardId },
    select: { userId: true, role: true },
  });
  return NextResponse.json({
    members: members.map((member) => ({
      ...member,
      boardRole:
        boardMembers.find((boardMember) => boardMember.userId === member.userId)?.role ?? null,
    })),
  });
}

export async function PUT(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (
    access.role !== WorkspaceRole.OWNER &&
    access.role !== WorkspaceRole.ADMIN
  ) {
    return NextResponse.json({ error: "Only workspace owners and admins can manage board roles" }, { status: 403 });
  }
  const parsed = boardMemberRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: access.board.workspaceId,
        userId: parsed.data.userId,
      },
    },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "User is not a workspace member" }, { status: 404 });
  if (member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN) {
    return NextResponse.json({ error: "Workspace owners and admins keep their workspace permissions on boards" }, { status: 400 });
  }
  const boardMember = await prisma.boardMember.upsert({
    where: {
      boardId_userId: { boardId: params.boardId, userId: parsed.data.userId },
    },
    update: { role: parsed.data.role as BoardMemberRole },
    create: {
      boardId: params.boardId,
      userId: parsed.data.userId,
      role: parsed.data.role as BoardMemberRole,
    },
  });
  return NextResponse.json({ member: boardMember });
}

export async function DELETE(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (
    access.role !== WorkspaceRole.OWNER &&
    access.role !== WorkspaceRole.ADMIN
  ) {
    return NextResponse.json({ error: "Only workspace owners and admins can manage board roles" }, { status: 403 });
  }
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  await prisma.boardMember.deleteMany({
    where: { boardId: params.boardId, userId: parsed.data.userId },
  });
  return NextResponse.json({ success: true });
}
