import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getBoardAccess, isResponse } from "@/lib/workspaces";
import { updateCustomFieldSchema } from "@/lib/validations/custom-fields";

type Context = { params: { boardId: string; fieldId: string } };

export async function PATCH(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) return NextResponse.json({ error: "Only workspace admins can manage custom fields" }, { status: 403 });
  const field = await prisma.customField.findFirst({ where: { id: params.fieldId, boardId: params.boardId, name: { not: { startsWith: "[Archived]" } } } });
  if (!field) return NextResponse.json({ error: "Custom field not found" }, { status: 404 });
  const parsed = updateCustomFieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const nextType = parsed.data.type ?? field.type;
  const oldOptions = field.options && typeof field.options === "object" ? field.options as { choices?: unknown; showOnCard?: unknown } : null;
  const nextOptions = parsed.data.options ?? (nextType === field.type ? (Array.isArray(oldOptions?.choices) ? oldOptions.choices : Array.isArray(field.options) ? field.options : []) : []);
  if (nextType === "DROPDOWN" && (!Array.isArray(nextOptions) || !nextOptions.length)) return NextResponse.json({ error: "Dropdown fields need at least one option" }, { status: 400 });
  if (nextType !== "DROPDOWN" && parsed.data.options?.length) return NextResponse.json({ error: "Only dropdown fields can have options" }, { status: 400 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.customField.update({ where: { id: field.id }, data: { name: parsed.data.name, type: nextType, required: parsed.data.required, position: parsed.data.position, options: { choices: nextType === "DROPDOWN" ? nextOptions : [], showOnCard: parsed.data.showOnCard ?? (typeof oldOptions?.showOnCard === "boolean" ? oldOptions.showOnCard : false) } } });
      await tx.activity.create({ data: { boardId: params.boardId, actorId: access.userId, entityType: "BOARD", entityId: params.boardId, action: parsed.data.position !== undefined ? "CUSTOM_FIELD_REORDERED" : "CUSTOM_FIELD_UPDATED", metadata: { fieldId: field.id, name: value.name } } });
      return value;
    });
    return NextResponse.json({ field: updated });
  } catch (error) {
    console.error("[custom-fields/update] Could not update custom field", { boardId: params.boardId, fieldId: field.id, error });
    return NextResponse.json({ error: "Could not update custom field. Names must be unique on the board." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) return NextResponse.json({ error: "Only workspace admins can manage custom fields" }, { status: 403 });
  const field = await prisma.customField.findFirst({ where: { id: params.fieldId, boardId: params.boardId, name: { not: { startsWith: "[Archived]" } } } });
  if (!field) return NextResponse.json({ error: "Custom field not found" }, { status: 404 });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.customField.update({ where: { id: field.id }, data: { name: `[Archived] ${field.id} ${field.name}` } });
      await tx.activity.create({ data: { boardId: params.boardId, actorId: access.userId, entityType: "BOARD", entityId: params.boardId, action: "CUSTOM_FIELD_ARCHIVED", metadata: { fieldId: field.id, name: field.name } } });
    });
    return NextResponse.json({ success: true, preservedValues: true });
  } catch (error) {
    console.error("[custom-fields/archive] Could not archive custom field", { boardId: params.boardId, fieldId: field.id, error });
    return NextResponse.json({ error: "Could not archive custom field" }, { status: 500 });
  }
}
