import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const settingsSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    bio: z.string().max(500).nullable().optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    defaultWorkspaceId: z.string().cuid().nullable().optional(),
  })
  .strict();

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const [profile, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        name: true,
        email: true,
        image: true,
        bio: true,
        theme: true,
        accentColor: true,
        defaultWorkspaceId: true,
        passwordHash: true,
      },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: currentUser.id, workspace: { archivedAt: null } },
      select: { role: true, workspace: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const { passwordHash, ...safeUser } = profile;
  return NextResponse.json({
    user: { ...safeUser, hasPassword: Boolean(passwordHash) },
    workspaces: memberships.map((membership) => ({
      ...membership.workspace,
      role: membership.role,
    })),
  });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (parsed.data.defaultWorkspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: parsed.data.defaultWorkspaceId,
          userId: currentUser.id,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "You are not a member of that workspace" }, { status: 403 });
    }
  }
  const profile = await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      name: parsed.data.name,
      bio: parsed.data.bio,
      theme: parsed.data.theme,
      accentColor: parsed.data.accentColor,
      defaultWorkspaceId: parsed.data.defaultWorkspaceId,
    },
    select: {
      name: true,
      email: true,
      image: true,
      bio: true,
      theme: true,
      accentColor: true,
      defaultWorkspaceId: true,
    },
  });
  return NextResponse.json({ user: profile });
}
