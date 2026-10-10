import { AttachmentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AttachmentValidationError, deleteStoredAttachment, isUploadFile, validateAndStoreFile } from "@/lib/storage";
import { canEditContent } from "@/lib/workspaces";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";
import { notifyCardSubscribers } from "@/lib/notifications";

const linkSchema = z.object({
  url: z.string().trim().url().max(2048).refine((value) => /^https?:\/\//i.test(value)),
  name: z.string().trim().min(1).max(120),
}).strict();

type Context = { params: { cardId: string } };

export async function POST(request: Request, { params }: Context) {
  try {
    const access = await getCardActorAccess(params.cardId);
    if (isCardActorResponse(access)) return access;
    if (!canEditContent(access.role) && access.role !== "CLIENT") {
      return NextResponse.json({ error: "Viewers cannot add attachments" }, { status: 403 });
    }
    if (access.cardVisibility !== "CLIENT_VISIBLE" && access.role === "CLIENT") {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const card = await prisma.card.findUnique({
      where: { id: params.cardId },
      select: { id: true, boardId: true },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!isUploadFile(file)) return NextResponse.json({ error: "Choose an image or PDF" }, { status: 400 });
      let stored;
      try {
        stored = await validateAndStoreFile(file);
      } catch (error) {
        if (error instanceof AttachmentValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error("[attachments/create] Attachment storage failed", error);
        return NextResponse.json({ error: "Attachment storage is unavailable" }, { status: 500 });
      }
      try {
        const attachment = await prisma.$transaction(async (tx) => {
          const created = await tx.attachment.create({
            data: {
              cardId: card.id,
              uploadedById: access.userId,
              type: stored.type,
              name: stored.name,
              url: stored.key,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
            },
          });
          await tx.activity.create({
            data: {
              boardId: card.boardId,
              cardId: card.id,
              actorId: access.userId,
              entityType: "CARD",
              entityId: card.id,
              action: "ATTACHMENT_ADDED",
              metadata: { attachmentId: created.id, name: created.name, type: created.type },
            },
          });
          return created;
        });
        try {
          await notifyCardSubscribers({
            cardId: card.id,
            actorId: access.userId,
            eventType: "COMMENT",
            title: access.role === "CLIENT" ? "Client uploaded a file" : "New attachment",
            body: "A file was added to a card.",
            clientVisibleActivity: access.role === "CLIENT",
          });
        } catch (error) {
          console.error("[attachments/create] Attachment saved but notifications failed", { cardId: card.id, error });
        }
        return NextResponse.json({
          attachment: { ...attachment, url: `/api/attachments/${attachment.id}/file` },
        }, { status: 201 });
      } catch (error) {
        console.error("[attachments/create] Attachment metadata could not be saved", error);
        try {
          await deleteStoredAttachment(stored.key);
        } catch (cleanupError) {
          console.error("[attachments/create] Could not clean up unreferenced uploaded file", cleanupError);
        }
        throw error;
      }
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = linkSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          cardId: card.id,
          uploadedById: access.userId,
          type: AttachmentType.LINK,
          name: parsed.data.name,
          url: parsed.data.url,
          mimeType: "text/uri-list",
        },
      });
      await tx.activity.create({
        data: {
          boardId: card.boardId,
          cardId: card.id,
          actorId: access.userId,
          entityType: "CARD",
          entityId: card.id,
          action: "ATTACHMENT_LINK_ADDED",
          metadata: { attachmentId: created.id, name: created.name },
        },
      });
      return created;
    });
    try {
      await notifyCardSubscribers({
        cardId: card.id,
        actorId: access.userId,
        eventType: "COMMENT",
        title: "New attachment",
        body: "A link was added to a card.",
        clientVisibleActivity: access.role === "CLIENT",
      });
    } catch (error) {
      console.error("[attachments/create] Attachment link saved but notifications failed", { cardId: card.id, error });
    }
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    console.error("[attachments/create] Could not create attachment", { cardId: params.cardId, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add attachment" }, { status: 500 });
  }
}
