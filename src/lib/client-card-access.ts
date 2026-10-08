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
      },
      select: { visibility: true, list: { select: { board: { select: { id: true, workspaceId: true, visibility: true } } } } },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    return {
      userId: null,
      role: WorkspaceRole.CLIENT,
      board: card.list.board,
      cardVisibility: card.visibility,
      actorLabel: share.clientName ?? share.clientEmail ?? "Client",
      shareToken,
    };
  }

  const access = await getCardCommentAccess(cardId);
  if (isResponse(access)) return access;
  return {
    ...access,
    actorLabel: null,
    shareToken: null,
  };
}

export function isCardActorResponse(value: CardActorAccess | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function asWorkspaceAccess(access: CardActorAccess): WorkspaceAccess {
  if (!access.userId) {
    throw new Error("Token-based client access has no authenticated workspace user");
  }
  return { userId: access.userId, role: access.role };
}
