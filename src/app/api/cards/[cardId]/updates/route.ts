import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";

const sinceSchema = z.string().datetime({ offset: true }).optional();

export async function GET(request: Request, { params }: { params: { cardId: string } }) {
  try {
    const access = await getCardActorAccess(params.cardId, request);
    if (isCardActorResponse(access)) return access;
    const sinceParsed = sinceSchema.safeParse(new URL(request.url).searchParams.get("since") ?? undefined);
    if (!sinceParsed.success) return NextResponse.json({ error: "Invalid update cursor" }, { status: 400 });
    const since = sinceParsed.data ? new Date(sinceParsed.data) : new Date(0);
    const [comments, attachments, activities] = await Promise.all([
      prisma.comment.findMany({
        where: {
          cardId: params.cardId,
          updatedAt: { gt: since },
          ...(access.role === "CLIENT" ? { visibility: "CLIENT" } : {}),
        },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, image: true } },
          reactions: { include: { user: { select: { id: true, name: true } } } },
        },
      }),
      prisma.attachment.findMany({
        where: {
          cardId: params.cardId,
          createdAt: { gt: since },
          isCurrentVersion: true,
        },
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { id: true, name: true, image: true } } },
      }),
      prisma.activity.findMany({
        where: {
          cardId: params.cardId,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, name: true, image: true } } },
      }),
    ]);
    return NextResponse.json({
      comments,
      attachments: attachments.map((attachment) => ({
        ...attachment,
        url: attachment.type === "LINK"
          ? attachment.url
          : `/api/attachments/${attachment.id}/file${access.shareToken ? `?share=${access.shareToken}` : ""}`,
      })),
      activities,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cards/updates] Could not load card updates", { cardId: params.cardId, error });
    return NextResponse.json({ error: "Could not load card updates" }, { status: 500 });
  }
}
