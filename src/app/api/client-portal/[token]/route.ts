import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientShareToken } from "@/lib/client-portal";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const share = await resolveClientShareToken(params.token);
  if (!share) return NextResponse.json({ error: "This client link is invalid, expired, or revoked" }, { status: 404 });
  const lists = await prisma.list.findMany({
    where: { boardId: share.boardId, archivedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      cards: {
        where: {
          archivedAt: null,
          visibility: "CLIENT_VISIBLE",
        },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          approvalStatus: true,
          revisionRound: true,
          createdAt: true,
          attachments: {
            where: { isCurrentVersion: true },
            orderBy: { createdAt: "asc" },
            select: { id: true, type: true, name: true, sizeBytes: true, mimeType: true, url: true },
          },
          comments: {
            where: { visibility: "CLIENT" },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              authorLabel: true,
              body: true,
              createdAt: true,
              author: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return NextResponse.json({
    board: { id: share.board.id, title: share.board.title },
    clientName: share.clientName,
    lists: lists.map((list) => ({
      id: list.id,
      title: list.title,
      cards: list.cards.map((card) => ({
        ...card,
        attachments: card.attachments.map((attachment) => ({
          ...attachment,
          url: attachment.type === "LINK"
            ? attachment.url
            : `/api/attachments/${attachment.id}/file?share=${params.token}`,
        })),
        comments: card.comments.map((comment) => ({
          ...comment,
          authorName: comment.author?.name ?? comment.authorLabel ?? "Client",
          author: undefined,
        })),
      })),
    })).filter((list) => list.cards.length > 0),
  });
}
