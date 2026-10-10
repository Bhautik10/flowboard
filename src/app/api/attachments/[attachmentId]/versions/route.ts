import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteStoredAttachment, isUploadFile, AttachmentValidationError, validateAndStoreFile } from "@/lib/storage";
import { canEditContent } from "@/lib/workspaces";
import { attachmentVersionSelectSchema } from "@/lib/validations/agency";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";

export const runtime = "nodejs";
type Context = { params: { attachmentId: string } };

async function versionAccess(attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, cardId: true, type: true, isCover: true, versionGroupId: true, card: { select: { id: true, boardId: true, visibility: true } } },
  });
  if (!attachment || attachment.type !== "IMAGE") return { response: NextResponse.json({ error: "Image attachment not found" }, { status: 404 }) };
  const access = await getCardActorAccess(attachment.cardId);
  if (isCardActorResponse(access)) return { response: access };
  if (access.role === "CLIENT" && attachment.card.visibility !== "CLIENT_VISIBLE") return { response: NextResponse.json({ error: "Image not found" }, { status: 404 }) };
  if (!canEditContent(access.role) && access.role !== "CLIENT") return { response: NextResponse.json({ error: "Viewers cannot manage versions" }, { status: 403 }) };
  return { attachment, access };
}

export async function GET(request: Request, { params }: Context) {
  const result = await versionAccess(params.attachmentId);
  if ("response" in result) return result.response;
  const groupId = result.attachment.versionGroupId ?? result.attachment.id;
  const versions = await prisma.attachment.findMany({
    where: {
      AND: [
        { OR: [{ id: groupId }, { versionGroupId: groupId }] },
      ],
    },
    orderBy: { versionNumber: "asc" },
    select: { id: true, name: true, versionNumber: true, isCurrentVersion: true, createdAt: true },
  });
  return NextResponse.json({ versions: versions.map((version) => ({
    ...version,
    url: `/api/attachments/${version.id}/file`,
  })) });
}

export async function POST(request: Request, { params }: Context) {
  const result = await versionAccess(params.attachmentId);
  if ("response" in result) return result.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!isUploadFile(file)) return NextResponse.json({ error: "Choose a new image version" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image versions are supported" }, { status: 400 });
  let stored;
  try {
    stored = await validateAndStoreFile(file);
  } catch (error) {
    if (error instanceof AttachmentValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[attachments/version] Image version storage failed", error);
    return NextResponse.json({ error: "Version storage is unavailable" }, { status: 500 });
  }
  const groupId = result.attachment.versionGroupId ?? result.attachment.id;
  try {
    const version = await prisma.$transaction(async (tx) => {
      const currentCover = await tx.attachment.findFirst({
        where: { OR: [{ id: groupId }, { versionGroupId: groupId }], isCover: true },
        select: { id: true },
      });
      await tx.attachment.updateMany({
        where: { OR: [{ id: groupId }, { versionGroupId: groupId }] },
        data: { versionGroupId: groupId, isCurrentVersion: false, isCover: false },
      });
      const latest = await tx.attachment.aggregate({
        where: { OR: [{ id: groupId }, { versionGroupId: groupId }] },
        _max: { versionNumber: true },
      });
      const created = await tx.attachment.create({
        data: {
          cardId: result.attachment.cardId,
          uploadedById: result.access.userId,
          type: "IMAGE",
          name: stored.name,
          url: stored.key,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          versionGroupId: groupId,
          versionNumber: (latest._max.versionNumber ?? 1) + 1,
          isCurrentVersion: true,
          isCover: Boolean(currentCover),
        },
        select: { id: true, name: true, versionNumber: true, isCurrentVersion: true },
      });
      if (currentCover) {
        await tx.card.update({
          where: { id: result.attachment.card.id },
          data: { coverType: "IMAGE", coverValue: `/api/attachments/${created.id}/file` },
        });
      }
      await tx.activity.create({
        data: {
          boardId: result.attachment.card.boardId,
          cardId: result.attachment.card.id,
          actorId: result.access.userId,
          entityType: "CARD",
          entityId: result.attachment.card.id,
          action: "DESIGN_VERSION_ADDED",
          metadata: { attachmentId: created.id, versionNumber: created.versionNumber },
        },
      });
      return created;
    });
    return NextResponse.json({
      version: {
        ...version,
        url: `/api/attachments/${version.id}/file`,
      },
    }, { status: 201 });
  } catch (error) {
    try {
      await deleteStoredAttachment(stored.key);
    } catch (cleanupError) {
      console.error("[attachments/version] Could not clean up unreferenced version", cleanupError);
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await versionAccess(params.attachmentId);
  if ("response" in result) return result.response;
  if (result.access.role === "CLIENT") return NextResponse.json({ error: "Clients cannot change the selected version" }, { status: 403 });
  const parsed = attachmentVersionSelectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const versionId = parsed.data.versionId;
  const groupId = result.attachment.versionGroupId ?? result.attachment.id;
  const version = await prisma.attachment.findFirst({
    where: { id: versionId, OR: [{ id: groupId }, { versionGroupId: groupId }] },
    select: { id: true },
  });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    const coverSelected = await tx.attachment.findFirst({
      where: { OR: [{ id: groupId }, { versionGroupId: groupId }], isCover: true },
      select: { id: true },
    });
    await tx.attachment.updateMany({
      where: { OR: [{ id: groupId }, { versionGroupId: groupId }] },
      data: { isCurrentVersion: false, isCover: false },
    });
    await tx.attachment.update({ where: { id: version.id }, data: { isCurrentVersion: true, isCover: Boolean(coverSelected) } });
    if (coverSelected) {
      await tx.card.update({
        where: { id: result.attachment.card.id },
        data: { coverType: "IMAGE", coverValue: `/api/attachments/${version.id}/file` },
      });
    }
    await tx.activity.create({
      data: {
        boardId: result.attachment.card.boardId,
        cardId: result.attachment.card.id,
        actorId: result.access.userId,
        entityType: "CARD",
        entityId: result.attachment.card.id,
        action: "DESIGN_VERSION_SELECTED",
        metadata: { attachmentId: version.id },
      },
    });
  });
  return NextResponse.json({ success: true });
}
