import { NextResponse } from "next/server";
import { CardCoverType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractMentionedUserIds, notifyMentionedMembers } from "@/lib/mentions";
import {
  canEditContent,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";
import { updateCardDetailsSchema } from "@/lib/validations/card-details";
import { clientItemVisibilityWhere, getCardActorAccess, isCardActorResponse } from "@/lib/client-card-access";

type Context = { params: { cardId: string } };

async function cardAccess(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, boardId: true },
  });
  if (!card) return { response: NextResponse.json({ error: "Card not found" }, { status: 404 }) };
  const access = await getBoardAccess(card.boardId);
  if (isResponse(access)) return { response: access };
  return { access };
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await cardAccess(params.cardId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot edit cards" }, { status: 403 });
  }
  const parsed = updateCardDetailsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const current = await prisma.card.findUniqueOrThrow({
    where: { id: params.cardId },
    select: {
      title: true,
      archivedAt: true,
      description: true,
      priority: true,
      startDate: true,
      dueDate: true,
      reminderAt: true,
      isComplete: true,
      coverValue: true,
      estimatedHours: true,
      visibility: true,
    },
  });
  const data: Prisma.CardUpdateInput = {
    title: parsed.data.title,
    archivedAt: parsed.data.archived === undefined ? undefined : parsed.data.archived ? new Date() : null,
    description: parsed.data.description,
    priority: parsed.data.priority,
    startDate: parsed.data.startDate === undefined ? undefined : parsed.data.startDate === null ? null : new Date(parsed.data.startDate),
    dueDate: parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate === null ? null : new Date(parsed.data.dueDate),
    reminderAt: parsed.data.reminderAt === undefined ? undefined : parsed.data.reminderAt === null ? null : new Date(parsed.data.reminderAt),
    isComplete: parsed.data.isComplete,
    completedAt: parsed.data.isComplete === undefined ? undefined : parsed.data.isComplete ? new Date() : null,
    coverType: parsed.data.coverValue === undefined ? undefined : parsed.data.coverValue ? CardCoverType.COLOR : CardCoverType.NONE,
    coverValue: parsed.data.coverValue,
    estimatedHours: parsed.data.estimatedHours,
    visibility: parsed.data.visibility,
  };
  const changes = Object.entries(parsed.data).filter(([key, value]) => {
    if (value === undefined) return false;
    if (key === "archived") return Boolean(current.archivedAt) !== value;
    const oldValue = current[key as keyof typeof current];
    return key === "startDate" || key === "dueDate" || key === "reminderAt"
      ? (oldValue instanceof Date ? oldValue.toISOString() : null) !== value
      : oldValue !== value;
  });
  const card = await prisma.$transaction(async (tx) => {
    const updated = await tx.card.update({
      where: { id: params.cardId },
      data,
    });
    await Promise.all(changes.map(([field, value]) =>
      tx.activity.create({
        data: {
          boardId: result.access.board.id,
          cardId: params.cardId,
          actorId: result.access.userId,
          entityType: "CARD",
          entityId: params.cardId,
          action: field === "archived" ? (value ? "CARD_ARCHIVED" : "CARD_RESTORED") : `CARD_${field.toUpperCase()}_UPDATED`,
          metadata: { field, value: value ?? null },
        },
      }),
    ));
    return updated;
  });
  if (typeof parsed.data.description === "string") {
    try {
      await notifyMentionedMembers({
        text: parsed.data.description,
        cardId: params.cardId,
        workspaceId: result.access.board.workspaceId,
        actorId: result.access.userId,
        previouslyMentioned: extractMentionedUserIds(current.description ?? ""),
        clientVisibleActivity: current.visibility === "CLIENT_VISIBLE",
      });
    } catch (error) {
      console.error("[cards/update] Card was updated but mention notifications failed", error);
    }
  }
  return NextResponse.json({ card });
}

export async function GET(request: Request, { params }: Context) {
  const access = await getCardActorAccess(params.cardId, request);
  if (isCardActorResponse(access)) return access;
  const clientWhere = access.role === "CLIENT" && access.clientKey
    ? clientItemVisibilityWhere(access.clientKey)
    : undefined;
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    include: {
      labels: { include: { label: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
      checklists: {
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
      subtasks: {
        where: { archivedAt: null },
        select: { id: true, title: true, isComplete: true },
        orderBy: { createdAt: "asc" },
      },
      watchers: { select: { userId: true } },
      attachments: {
        where: {
          isCurrentVersion: true,
          ...(access.role === "CLIENT" && clientWhere ? clientWhere : {}),
        },
        orderBy: { createdAt: "asc" },
        include: {
          uploadedBy: { select: { id: true, name: true, image: true } },
        },
      },
      comments: {
        where: access.role === "CLIENT"
          ? { visibility: "CLIENT", ...(clientWhere ?? {}) }
          : undefined,
        orderBy: { createdAt: "asc" },
        take: 100,
        include: {
          author: { select: { id: true, name: true, image: true } },
          reactions: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      activities: {
        where: access.role === "CLIENT"
          ? { OR: [
              { sharedWithAllClients: true },
              ...(access.clientKey ? [{ clientKey: access.clientKey }] : []),
            ] }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { id: true, name: true, image: true } } },
      },
      list: { select: { id: true, title: true } },
      clientShares: {
        ...(access.role === "CLIENT" && access.clientKey ? { where: { clientKey: access.clientKey } } : {}),
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!card || (access.role === "CLIENT" && card.visibility !== "CLIENT_VISIBLE")) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  if (access.role === "CLIENT") {
    const clientApproval = card.clientShares[0];
    return NextResponse.json({
      card: {
        id: card.id,
        boardId: card.boardId,
        title: card.title,
        description: card.description,
        visibility: card.visibility,
        approvalStatus: clientApproval?.approvalStatus ?? "NONE",
        revisionRound: clientApproval?.revisionRound ?? 0,
        priority: card.priority,
        startDate: null,
        dueDate: null,
        reminderAt: null,
        isComplete: false,
        coverValue: null,
        estimatedHours: null,
        parentCardId: null,
        isWatching: false,
        subtasks: [],
        labels: [],
        members: [],
        checklists: [],
        list: { id: "", title: "" },
        createdAt: card.createdAt,
        attachments: card.attachments.map((attachment) => ({
          ...attachment,
          url: attachment.type === "LINK"
            ? attachment.url
            : `/api/attachments/${attachment.id}/file${access.shareToken ? `?share=${access.shareToken}` : ""}`,
          uploadedBy: null,
        })),
        comments: card.comments.map((comment) => ({
          ...comment,
          authorId: comment.clientKey === access.clientKey ? null : comment.authorId,
          authorLabel: comment.clientKey === access.clientKey ? access.actorLabel ?? "Client" : comment.authorLabel,
          reactions: [],
        })),
        activities: card.activities,
        clientShares: [],
      },
      boardMembers: [],
      clients: [],
      targetBoards: [],
      currentUserId: access.userId,
      role: access.role,
      clientKey: access.clientKey,
    });
  }
  const boardMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: access.board.workspaceId },
    select: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  const clients = await prisma.boardMember.findMany({
    where: { boardId: access.board.id, role: "CLIENT" },
    select: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const targetBoards = await prisma.board.findMany({
    where: {
      workspaceId: access.board.workspaceId,
      archivedAt: null,
      OR: [
        { visibility: { not: "PRIVATE" } },
        { members: { some: { userId: access.userId } } },
        {
          workspace: {
            members: {
              some: {
                userId: access.userId,
                role: { in: ["OWNER", "ADMIN"] },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      lists: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          cards: {
            where: { archivedAt: null },
            orderBy: { position: "asc" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { title: "asc" },
  });
  const createdActivity = card?.activities.find(
    (activity) => activity.action === "CARD_CREATED" || activity.action === "CARD_COPIED",
  );
  return NextResponse.json({
    card: {
      ...card,
      labels: card?.labels.map(({ label }) => label) ?? [],
      members: card?.members.map(({ user }) => user) ?? [],
      isWatching: card?.watchers.some(({ userId }) => userId === access.userId) ?? false,
      createdBy: createdActivity?.actor ?? null,
      attachments: (card?.attachments ?? []).map((attachment) => ({
        ...attachment,
        url: attachment.type === "LINK"
          ? attachment.url
          : `/api/attachments/${attachment.id}/file`,
      })),
      comments: card?.comments ?? [],
    },
    boardMembers: boardMembers.map(({ user }) => user),
    targetBoards,
    clients: clients.map(({ user }) => user),
    cardShares: card?.clientShares.map((share) => ({
      clientKey: share.clientKey,
      userId: share.userId,
      shareLinkId: share.shareLinkId,
      approvalStatus: share.approvalStatus,
      revisionRound: share.revisionRound,
      approvedAt: share.approvedAt,
      user: share.user,
    })) ?? [],
    currentUserId: access.userId,
    role: access.role,
    clientKey: null,
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await cardAccess(params.cardId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot delete cards" }, { status: 403 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: {
        boardId: result.access.board.id,
        cardId: null,
        actorId: result.access.userId,
        entityType: "CARD",
        entityId: params.cardId,
        action: "CARD_DELETED",
      },
    });
    await tx.card.delete({ where: { id: params.cardId } });
  });
  return NextResponse.json({ success: true });
}
