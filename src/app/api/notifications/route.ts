import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { notificationReadSchema } from "@/lib/validations/notifications";
import { notificationEvents } from "@/lib/validations/notifications";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const notifications = await prisma.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
        metadata: true,
      },
    });
    const [clientBoards, clientWorkspaces] = await Promise.all([
      prisma.boardMember.findMany({
        where: { userId: user.id, role: "CLIENT" },
        select: { boardId: true },
      }),
      prisma.workspaceMember.findMany({
        where: { userId: user.id, role: "CLIENT" },
        select: { workspaceId: true },
      }),
    ]);
    const clientMode = clientBoards.length > 0 || clientWorkspaces.length > 0;
    const clientBoardIds = new Set(clientBoards.map(({ boardId }) => boardId));
    const clientCardIds = new Set<string>();
    if (clientBoardIds.size) {
      const visibleCards = await prisma.card.findMany({
        where: { boardId: { in: Array.from(clientBoardIds) }, visibility: "CLIENT_VISIBLE", archivedAt: null },
        select: { id: true },
      });
      visibleCards.forEach(({ id }) => clientCardIds.add(id));
    }
    const visibleNotifications = notifications.filter((notification) => {
      if (!clientMode) return true;
      if (!notification.metadata || typeof notification.metadata !== "object" || Array.isArray(notification.metadata)) return false;
      const metadata = notification.metadata as Record<string, unknown>;
      const cardId = metadata.cardId;
      return typeof cardId === "string" &&
        clientCardIds.has(cardId) &&
        metadata.eventType === notification.type &&
        notificationEvents.includes(notification.type as (typeof notificationEvents)[number]);
    });
    const unreadCount = visibleNotifications.filter(({ readAt }) => readAt === null).length;
    const page = visibleNotifications.slice(0, 30).map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    }));
    return NextResponse.json({ notifications: page, unreadCount });
  } catch (error) {
    console.error("[notifications/list] Failed to load notifications", { userId: user.id, error });
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = notificationReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    const result = await prisma.notification.updateMany({
      where: { recipientId: user.id, id: { in: parsed.data.ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error("[notifications/read] Failed to mark notifications read", { userId: user.id, error });
    return NextResponse.json({ error: "Could not update notifications" }, { status: 500 });
  }
}
