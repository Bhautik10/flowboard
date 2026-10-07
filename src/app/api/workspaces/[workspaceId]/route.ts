import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getWorkspaceAccess,
  isResponse,
} from "@/lib/workspaces";
import { updateWorkspaceSchema } from "@/lib/validations/workspaces";

type Context = { params: { workspaceId: string } };

export async function PATCH(request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Only the workspace owner can rename it" }, { status: 403 });
  }
  const parsed = updateWorkspaceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const workspace = await prisma.workspace.update({
    where: { id: params.workspaceId },
    data: { name: parsed.data.name },
  });
  return NextResponse.json({ workspace });
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await getWorkspaceAccess(params.workspaceId);
  if (isResponse(access)) return access;
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Only the workspace owner can delete it" }, { status: 403 });
  }
  await prisma.workspace.delete({ where: { id: params.workspaceId } });
  return NextResponse.json({ success: true });
}
