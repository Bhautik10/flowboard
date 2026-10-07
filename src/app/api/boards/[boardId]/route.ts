import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canManageWorkspace,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";
import { updateBoardSchema } from "@/lib/validations/workspaces";

type Context = { params: { boardId: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  const cardVisibilityFilter =
    access.role === "CLIENT" ? { visibility: "CLIENT_VISIBLE" as const } : {};
  const board = await prisma.board.findUnique({
    where: { id: params.boardId },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      lists: {
        where: {
          archivedAt: null,
          ...(access.role === "CLIENT"
            ? {
                cards: {
                  some: {
                    archivedAt: null,
                    parentCardId: null,
                    ...cardVisibilityFilter,
                    clientShares: { some: { userId: access.userId } },
                  },
                },
              }
            : {}),
        },
        orderBy: { position: "asc" },
        include: {
          cards: {
            where: {
              archivedAt: null,
              parentCardId: null,
              ...cardVisibilityFilter,
              ...(access.role === "CLIENT"
                ? { clientShares: { some: { userId: access.userId } } }
                : {}),
            },
            orderBy: { position: "asc" },
            include: {
              labels: { include: { label: true } },
              members: {
                include: {
                  user: { select: { id: true, name: true, image: true } },
                },
              },
              checklists: {
                include: { items: { select: { isComplete: true } } },
              },
              attachments: {
                where: { isCover: true, type: "IMAGE" },
                select: { id: true },
                take: 1,
              },
              _count: {
                select: {
                  attachments: {
                    where: {
                      isCurrentVersion: true,
                      ...(access.role === "CLIENT"
                        ? { OR: [{ clientKey: `user:${access.userId}` }, { sharedWithAllClients: true }] }
                        : {}),
                    },
                  },
                  comments: access.role === "CLIENT"
                    ? { where: {
                        visibility: "CLIENT",
                        OR: [{ clientKey: `user:${access.userId}` }, { sharedWithAllClients: true }],
                      } }
                    : true,
                },
              },
              clientShares: {
                ...(access.role === "CLIENT" ? { where: { userId: access.userId } } : {}),
                select: { userId: true, approvalStatus: true, revisionRound: true },
              },
            },
          },
        },
      },
      favorites: {
        where: { userId: access.userId },
        select: { id: true },
      },
    },
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
  return NextResponse.json({
    board: {
      ...board,
      lists: board.lists.map((list) => ({
        ...list,
        wipLimit: access.role === "CLIENT" ? null : list.wipLimit,
        cards: list.cards.map((card) => ({
          ...card,
          estimatedHours: access.role === "CLIENT" ? null : card.estimatedHours,
          clientShares: access.role === "CLIENT"
            ? card.clientShares.map(({ approvalStatus, revisionRound }) => ({ approvalStatus, revisionRound }))
            : card.clientShares,
          labels: card.labels.map(({ label }) => label),
          members: access.role === "CLIENT" ? [] : card.members.map(({ user }) => user),
        })),
      })),
      isFavorite: board.favorites.length > 0,
      favorites: undefined,
    },
    role: access.role,
  });
  } catch (error) {
    console.error("[boards/get] Could not load board data", { boardId: params.boardId, error });
    return NextResponse.json(
      { error: "Board data could not be loaded. Check the server logs and database migrations." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  const parsed = updateBoardSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const hasManagementChange =
    parsed.data.title !== undefined ||
    parsed.data.backgroundColor !== undefined ||
    parsed.data.backgroundImage !== undefined ||
    parsed.data.visibility !== undefined ||
    parsed.data.archived !== undefined;
  if (hasManagementChange && !canManageWorkspace(access.role)) {
    return NextResponse.json({ error: "Only workspace admins can change board settings" }, { status: 403 });
  }
  const board = await prisma.$transaction(async (tx) => {
    const current = await tx.board.findUniqueOrThrow({
      where: { id: params.boardId },
      select: { backgroundColor: true, backgroundImage: true },
    });
    const updated = await tx.board.update({
      where: { id: params.boardId },
      data: {
        title: parsed.data.title,
        backgroundColor: parsed.data.backgroundColor,
        backgroundImage: parsed.data.backgroundImage,
        visibility: parsed.data.visibility,
        archivedAt:
          parsed.data.archived === undefined
            ? undefined
            : parsed.data.archived
              ? new Date()
              : null,
      },
    });
    const backgroundChanged =
      (parsed.data.backgroundColor !== undefined &&
        parsed.data.backgroundColor !== current.backgroundColor) ||
      (parsed.data.backgroundImage !== undefined &&
        parsed.data.backgroundImage !== current.backgroundImage);
    if (backgroundChanged) {
      await tx.activity.create({
        data: {
          boardId: params.boardId,
          actorId: access.userId,
          entityType: "BOARD",
          entityId: params.boardId,
          action: "BOARD_BACKGROUND_UPDATED",
          metadata: {
            backgroundColor:
              parsed.data.backgroundColor !== undefined
                ? parsed.data.backgroundColor
                : current.backgroundColor,
            backgroundImage:
              parsed.data.backgroundImage !== undefined
                ? parsed.data.backgroundImage
                : current.backgroundImage,
          },
        },
      });
    }
    return updated;
  });
  return NextResponse.json({ board });
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ error: "Only workspace admins can delete boards" }, { status: 403 });
  }
  await prisma.board.delete({ where: { id: params.boardId } });
  return NextResponse.json({ success: true });
}
