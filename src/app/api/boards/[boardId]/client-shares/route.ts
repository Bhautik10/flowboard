import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashClientShareToken } from "@/lib/client-portal";
import { clientShareSchema } from "@/lib/validations/agency";
import { canManageWorkspace, getBoardAccess, isResponse } from "@/lib/workspaces";
import { z } from "zod";

type Context = { params: { boardId: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const access = await getBoardAccess(params.boardId);
    if (isResponse(access)) return access;
    if (!canManageWorkspace(access.role)) {
      return NextResponse.json({ error: "Only workspace admins can manage client links" }, { status: 403 });
    }
    const links = await prisma.clientShareLink.findMany({
      where: { boardId: params.boardId },
      select: { id: true, clientName: true, clientEmail: true, expiresAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ links });
  } catch (error) {
    console.error("[client-shares/get] Could not load client links", { boardId: params.boardId, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load client links" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const access = await getBoardAccess(params.boardId);
    if (isResponse(access)) return access;
    if (!canManageWorkspace(access.role)) {
      return NextResponse.json({ error: "Only workspace admins can create client links" }, { status: 403 });
    }
    const parsed = clientShareSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    if (parsed.data.expiresAt && new Date(parsed.data.expiresAt) <= new Date()) {
      return NextResponse.json({ error: "Expiry must be in the future" }, { status: 400 });
    }
    const token = randomBytes(32).toString("hex");
    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.clientShareLink.create({
        data: {
          boardId: params.boardId,
          createdById: access.userId,
          tokenHash: hashClientShareToken(token),
          clientName: parsed.data.clientName,
          clientEmail: parsed.data.clientEmail?.toLowerCase(),
          clientUserId: parsed.data.clientEmail
            ? (await tx.user.findUnique({
                where: { email: parsed.data.clientEmail.toLowerCase() },
                select: { id: true },
              }))?.id ?? null
            : null,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        },
        select: { id: true, clientName: true, clientEmail: true, expiresAt: true, revokedAt: true, createdAt: true },
      });
      const visibleCards = await tx.card.findMany({
        where: { boardId: params.boardId, visibility: "CLIENT_VISIBLE", archivedAt: null },
        select: { id: true, approvalStatus: true, revisionRound: true },
      });
      if (visibleCards.length) {
        await tx.cardClient.createMany({
          data: visibleCards.map((card) => ({
            cardId: card.id,
            clientKey: `link:${created.id}`,
            shareLinkId: created.id,
            approvalStatus: card.approvalStatus,
            revisionRound: card.revisionRound,
            approvedAt: card.approvalStatus === "APPROVED" ? new Date() : null,
          })),
          skipDuplicates: true,
        });
      }
      await tx.activity.create({
        data: {
          boardId: params.boardId,
          actorId: access.userId,
          entityType: "BOARD",
          entityId: params.boardId,
          action: "CLIENT_SHARE_CREATED",
          metadata: { shareId: created.id, clientEmail: created.clientEmail },
        },
      });
      return created;
    });
    return NextResponse.json({ link, url: `${new URL(request.url).origin}/client/${token}` }, { status: 201 });
  } catch (error) {
    console.error("[client-shares/create] Could not create client link", { boardId: params.boardId, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create client link" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const access = await getBoardAccess(params.boardId);
    if (isResponse(access)) return access;
    if (!canManageWorkspace(access.role)) {
      return NextResponse.json({ error: "Only workspace admins can revoke client links" }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get("id");
    const parsed = z.string().cuid().safeParse(id);
    if (!parsed.success) return NextResponse.json({ error: "A valid share link id is required" }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const revoked = await tx.clientShareLink.updateMany({
        where: { id: parsed.data, boardId: params.boardId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!revoked.count) return false;
      await tx.activity.create({
        data: {
          boardId: params.boardId,
          actorId: access.userId,
          entityType: "BOARD",
          entityId: params.boardId,
          action: "CLIENT_SHARE_REVOKED",
          metadata: { shareId: parsed.data },
        },
      });
      return true;
    });
    if (!result) return NextResponse.json({ error: "Active share link not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[client-shares/revoke] Could not revoke client link", { boardId: params.boardId, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not revoke client link" },
      { status: 500 },
    );
  }
}
