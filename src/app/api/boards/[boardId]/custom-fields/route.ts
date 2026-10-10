import { NextResponse } from "next/server";
import { positionBetween } from "@/lib/position";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getBoardAccess, isResponse } from "@/lib/workspaces";
import { customFieldSchema } from "@/lib/validations/custom-fields";

type Context = { params: { boardId: string } };

export async function GET(_request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (access.role === "CLIENT") return NextResponse.json({ error: "Custom fields are not available to clients" }, { status: 404 });
  const fields = await prisma.customField.findMany({ where: { boardId: params.boardId, name: { not: { startsWith: "[Archived]" } } }, orderBy: { position: "asc" } });
  return NextResponse.json({ fields });
}

export async function POST(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) return NextResponse.json({ error: "Only workspace admins can manage custom fields" }, { status: 403 });
  const parsed = customFieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const last = await prisma.customField.findFirst({ where: { boardId: params.boardId, name: { not: { startsWith: "[Archived]" } } }, orderBy: { position: "desc" }, select: { position: true } });
    const field = await prisma.$transaction(async (tx) => {
      const created = await tx.customField.create({ data: { boardId: params.boardId, name: parsed.data.name, type: parsed.data.type, options: { choices: parsed.data.options ?? [], showOnCard: parsed.data.showOnCard }, required: parsed.data.required, position: parsed.data.position ?? positionBetween(last?.position ?? null, null) } });
      await tx.activity.create({ data: { boardId: params.boardId, actorId: access.userId, entityType: "BOARD", entityId: params.boardId, action: "CUSTOM_FIELD_CREATED", metadata: { fieldId: created.id, name: created.name, type: created.type } } });
      return created;
    });
    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    console.error("[custom-fields/create] Could not create custom field", { boardId: params.boardId, error });
    return NextResponse.json({ error: "Could not create custom field. Names must be unique on the board." }, { status: 400 });
  }
}
