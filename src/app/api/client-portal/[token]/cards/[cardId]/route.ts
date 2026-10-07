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
    select: { id: true, boardId: true, title: true },
  });
  if (!card) return null;
  const assignment = await prisma.cardClient.findUnique({
    where: { cardId_clientKey: { cardId, clientKey: `link:${share.id}` } },
    select: { approvalStatus: true, revisionRound: true },
  });
  return assignment ? { share, card, assignment, clientKey: `link:${share.id}` } : null;
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
              uploadedById: result.share.clientUserId,
              type: stored.type,
              name: stored.name,
              url: stored.key,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              clientKey: result.clientKey,
            },
          });
          await tx.activity.create({
            data: {
              boardId: result.card.boardId,
              cardId: result.card.id,
              actorId: result.share.clientUserId,
              actorLabel,
              entityType: "CARD",
              entityId: result.card.id,
              action: "ATTACHMENT_ADDED",
              clientKey: result.clientKey,
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
            authorId: result.share.clientUserId,
            authorLabel: actorLabel,
            body: parsed.data.body,
            visibility: "CLIENT",
            clientKey: result.clientKey,
          },
          select: { id: true, body: true, createdAt: true, authorLabel: true },
        });
        await tx.activity.create({
          data: {
            boardId: result.card.boardId,
            cardId: result.card.id,
            actorId: result.share.clientUserId,
            actorLabel,
            entityType: "COMMENT",
            entityId: created.id,
            action: "COMMENT_ADDED",
            clientKey: result.clientKey,
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

    if (result.assignment.approvalStatus !== "PENDING") {
      return NextResponse.json({ error: "This card is not awaiting your approval" }, { status: 409 });
    }
    const nextStatus = parsed.data.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
    const revisionRound = parsed.data.action === "request-changes"
      ? result.assignment.revisionRound + 1
      : result.assignment.revisionRound;
    await prisma.$transaction(async (tx) => {
      await tx.cardClient.update({
        where: { cardId_clientKey: { cardId: result.card.id, clientKey: result.clientKey } },
        data: {
          approvalStatus: nextStatus,
          revisionRound,
          approvalNote: parsed.data.action === "request-changes" ? parsed.data.body : null,
          approvedAt: parsed.data.action === "approve" ? new Date() : null,
        },
      });
      await tx.activity.create({
        data: {
          boardId: result.card.boardId,
          cardId: result.card.id,
          actorId: result.share.clientUserId,
          actorLabel,
          entityType: "CARD",
          entityId: result.card.id,
          action: parsed.data.action === "approve" ? "CLIENT_APPROVED" : "CLIENT_CHANGES_REQUESTED",
          clientKey: result.clientKey,
          metadata: { status: nextStatus, revisionRound },
        },
      });
      if (parsed.data.action === "request-changes") {
        const comment = await tx.comment.create({
          data: {
            cardId: result.card.id,
            authorId: result.share.clientUserId,
            authorLabel: actorLabel,
            body: parsed.data.body,
            visibility: "CLIENT",
            clientKey: result.clientKey,
          },
        });
        await tx.activity.create({
          data: {
            boardId: result.card.boardId,
            cardId: result.card.id,
            actorId: result.share.clientUserId,
            actorLabel,
            entityType: "COMMENT",
            entityId: comment.id,
            action: "COMMENT_ADDED",
            clientKey: result.clientKey,
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
