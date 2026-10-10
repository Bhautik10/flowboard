import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { designPinUpdateSchema } from "@/lib/validations/agency";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { pinId: string } };

export async function PATCH(request: Request, { params }: Context) {
  const pin = await prisma.designPin.findUnique({
    where: { id: params.pinId },
    select: { id: true, attachment: { select: { card: { select: { id: true, boardId: true, visibility: true } } } } },
  });
  if (!pin) return NextResponse.json({ error: "Design pin not found" }, { status: 404 });
  const card = pin.attachment.card;
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return access;
  if (access.role === "CLIENT" && card.visibility !== "CLIENT_VISIBLE") return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  if (!canEditContent(access.role) && access.role !== "CLIENT") return NextResponse.json({ error: "You cannot resolve this pin" }, { status: 403 });
  const parsed = designPinUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.designPin.update({
      where: { id: pin.id },
      data: { resolvedAt: parsed.data.resolved ? new Date() : null },
      select: { id: true, resolvedAt: true },
    });
    await tx.activity.create({
      data: {
        boardId: card.boardId,
        cardId: card.id,
        actorId: access.userId,
        entityType: "CARD",
        entityId: card.id,
        action: parsed.data.resolved ? "DESIGN_PIN_RESOLVED" : "DESIGN_PIN_REOPENED",
        metadata: { pinId: pin.id },
      },
    });
    return result;
  });
  return NextResponse.json({ pin: updated });
}
