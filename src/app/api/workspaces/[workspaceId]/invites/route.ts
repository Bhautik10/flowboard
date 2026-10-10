import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMemberLimitError } from "@/lib/billing";
import {
  canManageWorkspace,
  getWorkspaceAccess,
  isResponse,
} from "@/lib/workspaces";
import { inviteWorkspaceSchema } from "@/lib/validations/workspaces";

type Context = { params: { workspaceId: string } };

export async function POST(request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ error: "Only workspace admins can invite members" }, { status: 403 });
  }
  const parsed = inviteWorkspaceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (
    parsed.data.role === WorkspaceRole.ADMIN &&
    access.role !== WorkspaceRole.OWNER
  ) {
    return NextResponse.json({ error: "Only owners can invite admins" }, { status: 403 });
  }

  const email = parsed.data.email.toLowerCase();
  const limitError = await getWorkspaceMemberLimitError(params.workspaceId, parsed.data.role, email);
  if (limitError) return NextResponse.json({ error: limitError }, { status: 403 });
  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: params.workspaceId, user: { email } },
    select: { id: true },
  });
  if (existingMember) {
    return NextResponse.json({ error: "This person is already a workspace member" }, { status: 409 });
  }
  const token = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const invite = await prisma.workspaceInvite.upsert({
    where: { workspaceId_email: { workspaceId: params.workspaceId, email } },
    update: {
      token,
      role: parsed.data.role,
      invitedById: access.userId,
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    create: {
      workspaceId: params.workspaceId,
      email,
      role: parsed.data.role,
      token,
      invitedById: access.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    select: { token: true, email: true, role: true, expiresAt: true },
  });
  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/invites/${invite.token}`;
  if (process.env.NODE_ENV === "development") {
    console.info(`Workspace invitation for ${email}: ${inviteUrl}`);
  }
  return NextResponse.json({ invite: { ...invite, inviteUrl } }, { status: 201 });
}
