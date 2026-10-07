import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { workspaceId: string } };

export async function GET(_request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  const [members, invites] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: params.workspaceId },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { name: true, email: true, image: true } },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    prisma.workspaceInvite.findMany({
      where: {
        workspaceId: params.workspaceId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    members,
    invites,
    role: access.role,
    currentUserId: access.userId,
  });
}
