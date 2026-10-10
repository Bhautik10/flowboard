import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBoardAccess, isResponse } from "@/lib/workspaces";
import { getWorkspaceBillingEntitlements } from "@/lib/billing";
import { isMissingTableError } from "@/lib/prisma-errors";

type Context = { params: { cardId: string } };
const inputSchema = z.object({ clientUserId: z.string().cuid() }).strict();

async function cardAccess(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId, archivedAt: null }, select: { id: true, boardId: true, visibility: true } });
  if (!card) return { response: NextResponse.json({ error: "Card not found" }, { status: 404 }) };
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return { response: access };
  if (!["OWNER", "ADMIN", "MEMBER"].includes(access.role)) return { response: NextResponse.json({ error: "You cannot share cards" }, { status: 403 }) };
  const entitlements = await getWorkspaceBillingEntitlements(access.board.workspaceId);
  if (!entitlements.clientSharing) return { response: NextResponse.json({ error: "Client card sharing is included with the Agency plan." }, { status: 403 }) };
  return { card, access };
}

export async function GET(_request: Request, { params }: Context) {
  const result = await cardAccess(params.cardId);
  if ("response" in result) return result.response;
  try {
  const [clients, shares] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { workspaceId: result.access.board.workspaceId, role: "CLIENT" }, select: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { joinedAt: "asc" } }),
    prisma.cardClient.findMany({ where: { cardId: result.card.id }, select: { clientUserId: true, createdAt: true, clientUser: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return NextResponse.json({ clients: clients.map(({ user }) => user), shares });
  } catch (error) {
    if (isMissingTableError(error, "CardClient")) return NextResponse.json({ error: "Card sharing is not available until the database migration is applied." }, { status: 503 });
    console.error("[cards/clients:list]", error);
    return NextResponse.json({ error: "Could not load card sharing" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const result = await cardAccess(params.cardId);
  if ("response" in result) return result.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: result.access.board.workspaceId, userId: parsed.data.clientUserId, role: "CLIENT" }, select: { id: true } });
  if (!member) return NextResponse.json({ error: "Choose a client in this workspace" }, { status: 404 });
  try {
    await prisma.$transaction([
      prisma.card.update({ where: { id: result.card.id }, data: { visibility: "CLIENT_VISIBLE" } }),
      prisma.cardClient.upsert({ where: { cardId_clientUserId: { cardId: result.card.id, clientUserId: parsed.data.clientUserId } }, update: {}, create: { cardId: result.card.id, clientUserId: parsed.data.clientUserId } }),
      prisma.activity.create({ data: { boardId: result.card.boardId, cardId: result.card.id, actorId: result.access.userId, entityType: "CARD", entityId: result.card.id, action: "CLIENT_SHARED", metadata: { clientUserId: parsed.data.clientUserId } } }),
    ]);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) { if (isMissingTableError(error, "CardClient")) return NextResponse.json({ error: "Card sharing is not available until the database migration is applied." }, { status: 503 }); console.error("[cards/clients:create]", error); return NextResponse.json({ error: "Could not share this card" }, { status: 500 }); }
}

export async function DELETE(request: Request, { params }: Context) {
  const result = await cardAccess(params.cardId);
  if ("response" in result) return result.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    await prisma.$transaction([
      prisma.cardClient.deleteMany({ where: { cardId: result.card.id, clientUserId: parsed.data.clientUserId } }),
      prisma.activity.create({ data: { boardId: result.card.boardId, cardId: result.card.id, actorId: result.access.userId, entityType: "CARD", entityId: result.card.id, action: "CLIENT_UNSHARED", metadata: { clientUserId: parsed.data.clientUserId } } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) { if (isMissingTableError(error, "CardClient")) return NextResponse.json({ error: "Card sharing is not available until the database migration is applied." }, { status: 503 }); console.error("[cards/clients:delete]", error); return NextResponse.json({ error: "Could not remove card sharing" }, { status: 500 }); }
}
