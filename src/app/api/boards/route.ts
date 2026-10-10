import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canManageWorkspace,
  getWorkspaceAccess,
  isResponse,
} from "@/lib/workspaces";
import { createBoardSchema } from "@/lib/validations/workspaces";

export async function POST(request: Request) {
  const parsed = createBoardSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const access = await getWorkspaceAccess(parsed.data.workspaceId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ error: "Only workspace admins can create boards" }, { status: 403 });
  }
  const board = await prisma.board.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      title: parsed.data.title,
      backgroundColor: parsed.data.backgroundColor,
      backgroundImage: parsed.data.backgroundImage,
      members: { create: { userId: access.userId, role: "ADMIN" } },
    },
  });
  return NextResponse.json({ board }, { status: 201 });
}
