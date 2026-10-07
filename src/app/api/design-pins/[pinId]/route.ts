import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { designPinUpdateSchema } from "@/lib/validations/agency";
import { canEditContent } from "@/lib/workspaces";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";

type Context = { params: { pinId: string } };

export async function PATCH(request: Request, { params }: Context) {
  const pin = await prisma.designPin.findUnique({
    where: { id: params.pinId },
    select: { id: true, attachmentId: true, clientKey: true, sharedWithAllClients: true, attachment: { select: { cardId: true, card: { select: { id: true, boardId: true, visibility: true } } } } },
  });
  if (!pin) return NextResponse.json({ error: "Design pin not found" }, { status: 404 });
  const access = await getCardActorAccess(pin.attachment.cardId, request);
  if (isCardActorResponse(access)) return access;
  if (access.role === "CLIENT" && (
    pin.attachment.card.visibility !== "CLIENT_VISIBLE" ||
    (pin.clientKey !== access.clientKey && !pin.sharedWithAllClients)
  )) return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  if (access.role === "CLIENT" && pin.clientKey !== access.clientKey) {
    return NextResponse.json({ error: "You can only resolve your own design pins" }, { status: 403 });
  }
  if (!canEditContent(access.role) && access.role !== "CLIENT") {
    return NextResponse.json({ error: "You cannot resolve this pin" }, { status: 403 });
  }
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
        boardId: pin.attachment.card.boardId,
        cardId: pin.attachment.card.id,
        actorId: access.userId,
        actorLabel: access.actorLabel,
        entityType: "CARD",
        entityId: pin.attachment.card.id,
        action: parsed.data.resolved ? "DESIGN_PIN_RESOLVED" : "DESIGN_PIN_REOPENED",
        clientKey: access.role === "CLIENT" ? access.clientKey : pin.clientKey,
        sharedWithAllClients: pin.sharedWithAllClients,
        metadata: { pinId: pin.id },
      },
    });
    return result;
  });
  return NextResponse.json({ pin: updated });
}
