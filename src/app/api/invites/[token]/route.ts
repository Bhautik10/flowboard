import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

type Context = { params: { token: string } };

export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token: params.token },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      workspace: { select: { name: true } },
    },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This invitation is invalid or expired" }, { status: 404 });
  }
  if (user.email?.toLowerCase() !== invite.email) {
    return NextResponse.json({ error: "Sign in with the invited email address" }, { status: 403 });
  }
  return NextResponse.json({ invite });
}

export async function POST(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token: params.token },
    select: {
      id: true,
      email: true,
      role: true,
      workspaceId: true,
      expiresAt: true,
      acceptedAt: true,
    },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This invitation is invalid or expired" }, { status: 404 });
  }
  if (user.email.toLowerCase() !== invite.email) {
    return NextResponse.json({ error: "Sign in with the invited email address" }, { status: 403 });
  }
  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: user.id,
        },
      },
      update: { role: invite.role },
      create: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
      },
    }),
    prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);
  return NextResponse.json({ success: true, workspaceId: invite.workspaceId });
}
