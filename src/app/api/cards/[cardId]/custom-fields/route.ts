import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";
import { customFieldValuesSchema, validateCustomFieldValue } from "@/lib/validations/custom-fields";

type Context = { params: { cardId: string } };

export async function PUT(request: Request, { params }: Context) {
  const card = await prisma.card.findUnique({ where: { id: params.cardId }, select: { id: true, boardId: true, visibility: true } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (access.role === "CLIENT" && card.visibility !== "CLIENT_VISIBLE") return NextResponse.json({ error: "Card not found" }, { status: 404 });
  if (!canEditContent(access.role)) return NextResponse.json({ error: "Viewers cannot edit custom fields" }, { status: 403 });
  const parsed = customFieldValuesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const fields = await prisma.customField.findMany({ where: { id: { in: parsed.data.values.map(({ fieldId }) => fieldId) }, boardId: card.boardId, name: { not: { startsWith: "[Archived]" } } } });
  if (fields.length !== parsed.data.values.length) return NextResponse.json({ error: "One or more custom fields are not available on this board" }, { status: 400 });
  const requiredFields = await prisma.customField.findMany({ where: { boardId: card.boardId, required: true, name: { not: { startsWith: "[Archived]" } } }, select: { id: true, name: true } });
  for (const requiredField of requiredFields) {
    const entry = parsed.data.values.find(({ fieldId }) => fieldId === requiredField.id);
    if (!entry || entry.value === null || entry.value === undefined || entry.value === "") return NextResponse.json({ error: `${requiredField.name} is required` }, { status: 400 });
  }
  for (const item of parsed.data.values) {
    const field = fields.find(({ id }) => id === item.fieldId)!;
    if (!validateCustomFieldValue(field.type, item.value, field.options)) return NextResponse.json({ error: `Invalid value for ${field.name}` }, { status: 400 });
    if (field.required && (item.value === null || item.value === undefined || item.value === "")) return NextResponse.json({ error: `${field.name} is required` }, { status: 400 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.values) {
        await tx.customFieldValue.upsert({ where: { customFieldId_cardId: { customFieldId: item.fieldId, cardId: card.id } }, create: { customFieldId: item.fieldId, cardId: card.id, value: item.value === null ? Prisma.JsonNull : item.value as Prisma.InputJsonValue }, update: { value: item.value === null ? Prisma.JsonNull : item.value as Prisma.InputJsonValue } });
      }
      await tx.activity.create({ data: { boardId: card.boardId, cardId: card.id, actorId: access.userId, entityType: "CARD", entityId: card.id, action: "CUSTOM_FIELDS_UPDATED", metadata: { fieldIds: parsed.data.values.map(({ fieldId }) => fieldId) } } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[card-custom-fields/update] Could not update values", { cardId: card.id, error });
    return NextResponse.json({ error: "Could not update custom field values" }, { status: 500 });
  }
}
