import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientShareToken } from "@/lib/client-portal";
import { AttachmentValidationError, deleteStoredAttachment, isUploadFile, validateAndStoreFile } from "@/lib/storage";
import { clientPortalCardActionSchema } from "@/lib/validations/agency";
import { notifyTeamOfClientApproval, notifyUsers } from "@/lib/notifications";

export const runtime = "nodejs";

type Context = { params: { token: string; cardId: string } };

async function sharedCard(token: string, cardId: string) {
  const share = await resolveClientShareToken(token);
  if (!share) return null;
  const card = await prisma.card.findFirst({
    where: { id: cardId, boardId: share.boardId, visibility: "CLIENT_VISIBLE", archivedAt: null },
    select: { id: true, boardId: true, title: true, approvalStatus: true, revisionRound: true },
  });
  return card ? { share, card } : null;
}

async function notifyTeam(cardId: string, title: string, body: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { list: { select: { board: { select: { workspaceId: true } } } } },
  });
  if (!card) return;
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: card.list.board.workspaceId, role: { not: "CLIENT" } },
    select: { userId: true },
  });
  await notifyUsers({
    cardId,
    recipientIds: members.map(({ userId }) => userId),
    eventType: "COMMENT",
    title,
    body,
    clientVisibleActivity: true,
  });
}

export async function POST(request: Request, { params }: Context) {
  try {
    const result = await sharedCard(params.token, params.cardId);
    if (!result) return NextResponse.json({ error: "Shared card not found" }, { status: 404 });
    const actorLabel = result.share.clientName ?? result.share.clientEmail ?? "Client";

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!isUploadFile(file)) return NextResponse.json({ error: "Choose an image or PDF" }, { status: 400 });
      let stored;
      try {
        stored = await validateAndStoreFile(file);
      } catch (error) {
        if (error instanceof AttachmentValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error("[client-portal/upload] Storage failed", error);
        return NextResponse.json({ error: "Attachment storage is unavailable" }, { status: 500 });
      }
      try {
        const attachment = await prisma.$transaction(async (tx) => {
          const created = await tx.attachment.create({
            data: {
              cardId: result.card.id,
              type: stored.type,
              name: stored.name,
              url: stored.key,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
            },
          });
          await tx.activity.create({
            data: {
              boardId: result.card.boardId,
              cardId: result.card.id,
              actorLabel,
              entityType: "CARD",
              entityId: result.card.id,
              action: "ATTACHMENT_ADDED",
              metadata: { attachmentId: created.id, name: created.name },
            },
          });
          return created;
        });
        try {
          await notifyTeam(result.card.id, "Client uploaded a file", `A client uploaded ${attachment.name}.`);
        } catch (error) {
          console.error("[client-portal/upload] Upload saved but team notification failed", { cardId: result.card.id, error });
        }
        return NextResponse.json({ attachment: { id: attachment.id, name: attachment.name } }, { status: 201 });
      } catch (error) {
        try {
          await deleteStoredAttachment(stored.key);
        } catch (cleanupError) {
          console.error("[client-portal/upload] Failed to clean up stored upload", cleanupError);
        }
        throw error;
      }
    }

    const parsed = clientPortalCardActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        error: "A non-empty comment is required, or choose Approve or Request changes with a note.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }
    if (parsed.data.action === "comment") {
      const comment = await prisma.$transaction(async (tx) => {
        const created = await tx.comment.create({
          data: {
            cardId: result.card.id,
            authorLabel: actorLabel,
            body: parsed.data.body,
            visibility: "CLIENT",
          },
          select: { id: true, body: true, createdAt: true, authorLabel: true },
        });
        await tx.activity.create({
          data: {
            boardId: result.card.boardId,
            cardId: result.card.id,
            actorLabel,
            entityType: "COMMENT",
            entityId: created.id,
            action: "COMMENT_ADDED",
            metadata: { commentId: created.id },
          },
        });
        return created;
      });
      try {
        await notifyTeam(result.card.id, "New client comment", "A client commented on a shared card.");
      } catch (error) {
        console.error("[client-portal/comment] Comment saved but team notification failed", { cardId: result.card.id, error });
      }
      return NextResponse.json({ comment: { ...comment, authorName: actorLabel } }, { status: 201 });
    }

    if (result.card.approvalStatus !== "PENDING") {
      return NextResponse.json({ error: "This card is not awaiting your approval" }, { status: 409 });
    }
    const nextStatus = parsed.data.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
    const revisionRound = parsed.data.action === "request-changes"
      ? result.card.revisionRound + 1
      : result.card.revisionRound;
    await prisma.$transaction(async (tx) => {
      await tx.card.update({
        where: { id: result.card.id },
        data: { approvalStatus: nextStatus, revisionRound },
      });
      await tx.activity.create({
        data: {
          boardId: result.card.boardId,
          cardId: result.card.id,
          actorLabel,
          entityType: "CARD",
          entityId: result.card.id,
          action: parsed.data.action === "approve" ? "CLIENT_APPROVED" : "CLIENT_CHANGES_REQUESTED",
          metadata: { status: nextStatus, revisionRound },
        },
      });
      if (parsed.data.action === "request-changes") {
        const comment = await tx.comment.create({
          data: {
            cardId: result.card.id,
            authorLabel: actorLabel,
            body: parsed.data.body,
            visibility: "CLIENT",
          },
        });
        await tx.activity.create({
          data: {
            boardId: result.card.boardId,
            cardId: result.card.id,
            actorLabel,
            entityType: "COMMENT",
            entityId: comment.id,
            action: "COMMENT_ADDED",
            metadata: { commentId: comment.id, reason: "CHANGES_REQUESTED" },
          },
        });
      }
    });
    try {
      await notifyTeamOfClientApproval({
        cardId: result.card.id,
        eventType: parsed.data.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED",
        title: parsed.data.action === "approve" ? "Card approved" : "Changes requested",
      });
    } catch (error) {
      console.error("[client-portal/approval] Response saved but notifications failed", { cardId: result.card.id, error });
    }
    return NextResponse.json({ approvalStatus: nextStatus, revisionRound });
  } catch (error) {
    console.error("[client-portal/card-action] Could not save client action", { cardId: params.cardId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save your response" }, { status: 500 });
  }
}
