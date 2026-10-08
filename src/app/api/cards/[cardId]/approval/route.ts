import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { approvalActionSchema } from "@/lib/validations/agency";
import { canEditContent } from "@/lib/workspaces";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";
import { notifyApprovalClients, notifyTeamOfClientApproval } from "@/lib/notifications";

export async function POST(request: Request, { params }: { params: { cardId: string } }) {
  try {
    const access = await getCardActorAccess(params.cardId, request);
    if (isCardActorResponse(access)) return access;
    if (access.cardVisibility !== "CLIENT_VISIBLE") {
      return NextResponse.json({ error: "Only client-visible cards can be approved" }, { status: 404 });
    }
    const parsed = approvalActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const isClientAction = parsed.data.action === "approve" || parsed.data.action === "request-changes";
    if (isClientAction !== (access.role === "CLIENT") || (!isClientAction && !canEditContent(access.role))) {
      return NextResponse.json({ error: "You do not have permission for this approval action" }, { status: 403 });
    }
    const card = await prisma.card.findUnique({
      where: { id: params.cardId },
      select: { id: true, boardId: true, title: true, approvalStatus: true, revisionRound: true },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    if (parsed.data.action === "send") {
      await prisma.$transaction(async (tx) => {
        await tx.card.update({
          where: { id: card.id },
          data: {
            approvalStatus: "PENDING",
            revisionRound: card.revisionRound < 1 ? 1 : card.revisionRound,
          },
        });
        await tx.activity.create({
          data: {
            boardId: card.boardId,
            cardId: card.id,
            actorId: access.userId,
            entityType: "CARD",
            entityId: card.id,
            action: "CARD_SENT_FOR_APPROVAL",
          },
        });
      });
      if (access.userId) {
        try {
          await notifyApprovalClients({ cardId: card.id, actorId: access.userId });
        } catch (error) {
          console.error("[approval/send] Approval was sent but client notifications failed", { cardId: card.id, error });
        }
      }
      return NextResponse.json({ sent: true });
    }

    if (card.approvalStatus !== "PENDING") {
      return NextResponse.json({ error: "This card is not awaiting your approval" }, { status: 409 });
    }
    const nextStatus = parsed.data.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
    const revisionRound = parsed.data.action === "request-changes" ? card.revisionRound + 1 : card.revisionRound;
    await prisma.$transaction(async (tx) => {
      await tx.card.update({
        where: { id: card.id },
        data: { approvalStatus: nextStatus, revisionRound },
      });
      if (parsed.data.action === "request-changes") {
        const comment = await tx.comment.create({
          data: {
            cardId: card.id,
            authorId: access.userId,
            authorLabel: access.actorLabel,
            body: parsed.data.body,
            visibility: "CLIENT",
          },
        });
        await tx.activity.create({
          data: {
            boardId: card.boardId,
            cardId: card.id,
            actorId: access.userId,
            actorLabel: access.actorLabel,
            entityType: "COMMENT",
            entityId: comment.id,
            action: "COMMENT_ADDED",
            metadata: { commentId: comment.id, reason: "CHANGES_REQUESTED" },
          },
        });
      }
      await tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          actorLabel: access.actorLabel,
          entityType: "CARD",
          entityId: card.id,
          action: parsed.data.action === "approve" ? "CLIENT_APPROVED" : "CLIENT_CHANGES_REQUESTED",
          metadata: { status: nextStatus, revisionRound },
        },
      });
    });
    try {
      await notifyTeamOfClientApproval({
        cardId: card.id,
        actorId: access.userId,
        eventType: parsed.data.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED",
        title: parsed.data.action === "approve" ? "Card approved" : "Changes requested",
      });
    } catch (error) {
      console.error("[approval/client] Client response saved but team notification failed", { cardId: card.id, error });
    }
    return NextResponse.json({
      approvalStatus: nextStatus,
      revisionRound,
      note: parsed.data.action === "request-changes" ? parsed.data.body : null,
    });
  } catch (error) {
    console.error("[approval] Could not update card approval", { cardId: params.cardId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update approval" }, { status: 500 });
  }
}
