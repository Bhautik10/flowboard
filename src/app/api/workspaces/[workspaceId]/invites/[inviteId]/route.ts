import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { canManageMembers, getWorkspaceAccess, isResponse } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";

type Context = { params: { workspaceId: string; inviteId: string } };

export async function POST(request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can resend invitations" }, { status: 403 });
  }
  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: params.inviteId, workspaceId: params.workspaceId, acceptedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  const token = randomBytes(32).toString("hex");
  const updated = await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: {
      token,
      invitedById: access.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    select: { email: true, expiresAt: true, token: true },
  });
  const inviteUrl = `${new URL(request.url).origin}/invites/${updated.token}`;
  if (process.env.NODE_ENV === "development") {
    console.info(`Workspace invitation for ${updated.email}: ${inviteUrl}`);
  }
  return NextResponse.json({ inviteUrl, expiresAt: updated.expiresAt });
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (!canManageMembers(access.role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can cancel invitations" }, { status: 403 });
  }
  const deleted = await prisma.workspaceInvite.deleteMany({
    where: {
      id: params.inviteId,
      workspaceId: params.workspaceId,
      acceptedAt: null,
    },
  });
  if (!deleted.count) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
