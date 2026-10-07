import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { resolveClientShareToken } from "@/lib/client-portal";
import { prisma } from "@/lib/prisma";
import { getCardCommentAccess, isResponse, type WorkspaceAccess } from "@/lib/workspaces";

export type CardActorAccess = {
  userId: string | null;
  role: WorkspaceRole;
  board: { id: string; workspaceId: string; visibility: "PRIVATE" | "WORKSPACE" | "PUBLIC" };
  cardVisibility: "INTERNAL" | "CLIENT_VISIBLE";
  clientKey: string | null;
  clientUserId: string | null;
  clientShareLinkId: string | null;
  actorLabel: string | null;
  shareToken: string | null;
};

export async function getCardActorAccess(cardId: string, request: Request): Promise<CardActorAccess | NextResponse> {
  const shareToken = new URL(request.url).searchParams.get("share");
  if (shareToken) {
    const share = await resolveClientShareToken(shareToken);
    if (!share) return NextResponse.json({ error: "This client link is invalid, expired, or revoked" }, { status: 404 });
    const card = await prisma.card.findFirst({
      where: {
        id: cardId,
        boardId: share.boardId,
        archivedAt: null,
        visibility: "CLIENT_VISIBLE",
        clientShares: { some: { shareLinkId: share.id } },
      },
      select: { id: true, boardId: true, visibility: true, list: { select: { board: { select: { id: true, workspaceId: true, visibility: true } } } } },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    return {
      userId: null,
      role: WorkspaceRole.CLIENT,
      board: card.list.board,
      cardVisibility: card.visibility,
      clientKey: `link:${share.id}`,
      clientUserId: share.clientUserId,
      clientShareLinkId: share.id,
      actorLabel: share.clientName ?? share.clientEmail ?? "Client",
      shareToken,
    };
  }

  const access = await getCardCommentAccess(cardId);
  if (isResponse(access)) return access;
  if (access.role !== WorkspaceRole.CLIENT) {
    return {
      ...access,
      clientKey: null,
      clientUserId: null,
      clientShareLinkId: null,
      actorLabel: null,
      shareToken: null,
    };
  }
  const assignment = await prisma.cardClient.findUnique({
    where: { cardId_clientKey: { cardId, clientKey: `user:${access.userId}` } },
    select: { id: true },
  });
  if (!assignment) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  return {
    ...access,
    clientKey: `user:${access.userId}`,
    clientUserId: access.userId,
    clientShareLinkId: null,
    actorLabel: null,
    shareToken: null,
  };
}

export function isCardActorResponse(value: CardActorAccess | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function clientItemVisibilityWhere(clientKey: string) {
  return {
    OR: [
      { clientKey },
      { sharedWithAllClients: true },
    ],
  };
}

export async function cardClientKeys(cardId: string) {
  return prisma.cardClient.findMany({
    where: { cardId },
    select: { clientKey: true, userId: true, shareLinkId: true },
  });
}

export function asWorkspaceAccess(access: CardActorAccess): WorkspaceAccess {
  if (!access.userId) {
    throw new Error("Token-based client access has no authenticated workspace user");
  }
  return { userId: access.userId, role: access.role };
}
