import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMemberLimitError } from "@/lib/billing";
import {
  canManageMembers,
  getWorkspaceAccess,
  isResponse,
} from "@/lib/workspaces";
import { workspaceRoleSchema } from "@/lib/validations/workspaces";

type Context = { params: { workspaceId: string; userId: string } };

class MemberChangeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can change roles" }, { status: 403 });
  }
  const parsed = workspaceRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (
    parsed.data.role === WorkspaceRole.OWNER &&
    access.role !== WorkspaceRole.OWNER
  ) {
    return NextResponse.json({ error: "Only an owner can assign the Owner role" }, { status: 403 });
  }
  const currentTarget = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.workspaceId, userId: params.userId } },
    select: { role: true, user: { select: { email: true } } },
  });
  if (currentTarget?.role === WorkspaceRole.CLIENT && parsed.data.role !== WorkspaceRole.CLIENT) {
    const limitError = await getWorkspaceMemberLimitError(params.workspaceId, parsed.data.role, currentTarget.user.email);
    if (limitError) return NextResponse.json({ error: limitError }, { status: 403 });
  }
  try {
    const member = await prisma.$transaction(
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: params.workspaceId,
              userId: params.userId,
            },
          },
          select: { role: true },
        });
        if (!target) throw new MemberChangeError("Member not found", 404);
        if (
          target.role === WorkspaceRole.OWNER &&
          parsed.data.role !== WorkspaceRole.OWNER
        ) {
          const owners = await tx.workspaceMember.count({
            where: { workspaceId: params.workspaceId, role: WorkspaceRole.OWNER },
          });
          if (owners <= 1) {
            throw new MemberChangeError("The last workspace owner cannot be demoted", 409);
          }
          if (access.role !== WorkspaceRole.OWNER) {
            throw new MemberChangeError("Only an owner can change another owner's role", 403);
          }
        }
        if (
          access.role === WorkspaceRole.ADMIN &&
          (target.role === WorkspaceRole.ADMIN ||
            target.role === WorkspaceRole.OWNER ||
            parsed.data.role === WorkspaceRole.ADMIN ||
            parsed.data.role === WorkspaceRole.OWNER)
        ) {
          throw new MemberChangeError("Admins can only change Member and Viewer roles", 403);
        }
        return tx.workspaceMember.update({
          where: {
            workspaceId_userId: {
              workspaceId: params.workspaceId,
              userId: params.userId,
            },
          },
          data: { role: parsed.data.role },
          select: { userId: true, role: true },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof MemberChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can remove members" }, { status: 403 });
  }
  try {
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: params.workspaceId,
              userId: params.userId,
            },
          },
          select: { role: true },
        });
        if (!target) throw new MemberChangeError("Member not found", 404);
        if (target.role === WorkspaceRole.OWNER) {
          const owners = await tx.workspaceMember.count({
            where: { workspaceId: params.workspaceId, role: WorkspaceRole.OWNER },
          });
          if (owners <= 1) {
            throw new MemberChangeError("The last workspace owner cannot be removed", 409);
          }
          if (access.role !== WorkspaceRole.OWNER) {
            throw new MemberChangeError("Only an owner can remove another owner", 403);
          }
        }
        if (access.role === WorkspaceRole.ADMIN && target.role !== WorkspaceRole.MEMBER && target.role !== WorkspaceRole.VIEWER && target.role !== WorkspaceRole.CLIENT) {
          throw new MemberChangeError("Admins can only remove Members, Viewers, and Clients", 403);
        }
        await tx.boardMember.deleteMany({
          where: {
            userId: params.userId,
            board: { workspaceId: params.workspaceId },
          },
        });
        await tx.workspaceMember.delete({
          where: {
            workspaceId_userId: {
              workspaceId: params.workspaceId,
              userId: params.userId,
            },
          },
        });
        await tx.user.updateMany({
          where: {
            id: params.userId,
            defaultWorkspaceId: params.workspaceId,
          },
          data: { defaultWorkspaceId: null },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof MemberChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
