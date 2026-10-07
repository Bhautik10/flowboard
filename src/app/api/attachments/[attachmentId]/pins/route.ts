import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { designPinCreateSchema } from "@/lib/validations/agency";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";
import { canEditContent } from "@/lib/workspaces";

export const runtime = "nodejs";
type Context = { params: { attachmentId: string } };

async function attachmentAccess(attachmentId: string, request: Request) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      type: true,
      cardId: true,
      clientKey: true,
      sharedWithAllClients: true,
      card: { select: { id: true, boardId: true, visibility: true } },
    },
  });
  if (!attachment || attachment.type !== "IMAGE") {
    return { response: NextResponse.json({ error: "Image attachment not found" }, { status: 404 }) } as const;
  }
  const access = await getCardActorAccess(attachment.cardId, request);
  if (isCardActorResponse(access)) return { response: access } as const;
  if (access.role === "CLIENT" && (
    attachment.card.visibility !== "CLIENT_VISIBLE" ||
    (attachment.clientKey !== access.clientKey && !attachment.sharedWithAllClients)
  )) {
    return { response: NextResponse.json({ error: "Image not found" }, { status: 404 }) } as const;
  }
  return { attachment, access } as const;
}

export async function GET(request: Request, { params }: Context) {
  try {
    const result = await attachmentAccess(params.attachmentId, request);
    if ("response" in result) return result.response;
    const pins = await prisma.designPin.findMany({
      where: {
        attachmentId: result.attachment.id,
        ...(result.access.role === "CLIENT" ? {
          OR: [
            { clientKey: result.access.clientKey },
            { sharedWithAllClients: true },
          ],
        } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        x: true,
        y: true,
        resolvedAt: true,
        createdAt: true,
        authorLabel: true,
        clientKey: true,
        author: { select: { name: true } },
      },
    });
    return NextResponse.json({
      pins: pins.map((pin) => ({
        ...pin,
        authorName: pin.clientKey === result.access.clientKey
          ? result.access.actorLabel ?? "Client"
          : pin.author?.name ?? pin.authorLabel ?? "Member",
        author: undefined,
      })),
    });
  } catch (error) {
    console.error("[design-pins/list] Could not load pins", { attachmentId: params.attachmentId, error });
    return NextResponse.json({ error: "Could not load design pins" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const result = await attachmentAccess(params.attachmentId, request);
    if ("response" in result) return result.response;
    if (!canEditContent(result.access.role) && result.access.role !== "CLIENT") {
      return NextResponse.json({ error: "Viewers cannot add design pins" }, { status: 403 });
    }
    const parsed = designPinCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const clientKey = result.access.role === "CLIENT" ? result.access.clientKey : parsed.data.clientKey ?? null;
    const sharedWithAllClients = result.access.role === "CLIENT" ? false : parsed.data.sharedWithAllClients === true;
    if (result.access.role !== "CLIENT" && clientKey) {
      const assigned = await prisma.cardClient.findUnique({
        where: { cardId_clientKey: { cardId: result.attachment.cardId, clientKey } },
        select: { id: true },
      });
      if (!assigned) return NextResponse.json({ error: "Choose a client assigned to this card" }, { status: 400 });
    }
    const pin = await prisma.$transaction(async (tx) => {
      const created = await tx.designPin.create({
        data: {
          attachmentId: result.attachment.id,
          authorId: result.access.userId,
          authorLabel: result.access.actorLabel,
          body: parsed.data.body,
          x: parsed.data.x,
          y: parsed.data.y,
          clientKey,
          sharedWithAllClients,
        },
      });
      await tx.activity.create({
        data: {
          boardId: result.attachment.card.boardId,
          cardId: result.attachment.cardId,
          actorId: result.access.userId,
          actorLabel: result.access.actorLabel,
          entityType: "CARD",
          entityId: result.attachment.cardId,
          action: "DESIGN_PIN_ADDED",
          clientKey,
          sharedWithAllClients,
          metadata: { pinId: created.id },
        },
      });
      return created;
    });
    return NextResponse.json({
      pin: { ...pin, authorName: result.access.actorLabel ?? "Member" },
    }, { status: 201 });
  } catch (error) {
    console.error("[design-pins/create] Could not create pin", { attachmentId: params.attachmentId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add design pin" }, { status: 500 });
  }
}
