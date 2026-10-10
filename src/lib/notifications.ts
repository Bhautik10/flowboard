import { NotificationType, Prisma, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notificationEvents, type notificationEventSchema } from "@/lib/validations/notifications";
import { z } from "zod";

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

type NotifyInput = {
  cardId: string;
  recipientIds: string[];
  actorId?: string | null;
  eventType: NotificationEvent;
  title: string;
  body: string;
  clientVisibleActivity?: boolean;
  dedupeKey?: (recipientId: string) => string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

async function sendNotificationEmail({
  email,
  name,
  title,
  body,
  cardUrl,
}: {
  email: string;
  name: string | null;
  title: string;
  body: string;
  cardUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      console.info("[notifications/email:dev]", { to: email, subject: title, url: cardUrl });
      return;
    }
    throw new Error("RESEND_API_KEY must be configured to send notification email");
  }
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL must be set when RESEND_API_KEY is configured");
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hello,";
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const safeUrl = escapeHtml(cardUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: title,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#172033"><p>${greeting}</p><h1 style="font-size:22px">${safeTitle}</h1><p>${safeBody}</p><p style="margin:28px 0"><a href="${safeUrl}" style="background:#4f46e5;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open card</a></p><p style="font-size:12px;color:#64748b">You received this email because of your FlowBoard notification settings.</p></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend email failed (${response.status}): ${detail}`);
  }
}

export async function notifyUsers(input: NotifyInput) {
  const card = await prisma.card.findUnique({
    where: { id: input.cardId },
    select: {
      id: true,
      title: true,
      visibility: true,
      boardId: true,
      list: {
        select: {
          board: {
            select: {
              workspaceId: true,
              workspace: {
                select: { members: { select: { userId: true, role: true } } },
              },
              members: { select: { userId: true, role: true } },
            },
          },
        },
      },
    },
  });
  if (!card) return;

  const boardClientIds = new Set(card.list.board.members
    .filter((member) => member.role === "CLIENT")
    .map((member) => member.userId));
  const allowedRecipients = new Set(
    card.list.board.workspace.members
      .filter((member) => member.userId !== input.actorId)
      .filter((member) => {
        const isClient = member.role === WorkspaceRole.CLIENT || boardClientIds.has(member.userId);
        return !isClient || (
          input.clientVisibleActivity === true &&
          card.visibility === "CLIENT_VISIBLE" &&
          boardClientIds.has(member.userId)
        );
      })
      .map((member) => member.userId),
  );
  const recipientIds = Array.from(new Set(input.recipientIds))
    .filter((id) => allowedRecipients.has(id));
  if (!recipientIds.length) return;

  const [users, preferences] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, email: true, name: true },
    }),
    prisma.notificationPreference.findMany({
      where: { userId: { in: recipientIds }, eventType: input.eventType },
      select: { userId: true, inApp: true, email: true },
    }),
  ]);
  const preferenceByUser = new Map(preferences.map((preference) => [preference.userId, preference]));
  const url = `${process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000"}/boards/${card.boardId}?card=${card.id}`;
  const type = input.eventType as NotificationType;
  const notificationRows = users
    .filter((user) => preferenceByUser.get(user.id)?.inApp !== false || Boolean(input.dedupeKey))
    .map((user) => ({
      recipientId: user.id,
      type,
      title: input.title,
      body: input.body,
      link: `/boards/${card.boardId}?card=${card.id}`,
      metadata: { cardId: card.id, boardId: card.boardId, eventType: input.eventType } as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey?.(user.id) ?? null,
      readAt: preferenceByUser.get(user.id)?.inApp === false ? new Date() : null,
    }));
  const existingKeys = input.dedupeKey
    ? new Set((await prisma.notification.findMany({
        where: { dedupeKey: { in: users.map(({ id }) => input.dedupeKey!(id)) } },
        select: { dedupeKey: true },
      })).map(({ dedupeKey }) => dedupeKey))
    : new Set<string | null>();
  const newRecipientIds = new Set(users
    .filter((user) => !input.dedupeKey || !existingKeys.has(input.dedupeKey(user.id)))
    .map(({ id }) => id));
  if (notificationRows.length) {
    await prisma.notification.createMany({ data: notificationRows, skipDuplicates: true });
  }

  const emailJobs = users
    .filter((user) => preferenceByUser.get(user.id)?.email === true && newRecipientIds.has(user.id))
    .map((user) => sendNotificationEmail({
      email: user.email,
      name: user.name,
      title: input.title,
      body: input.body,
      cardUrl: url,
    }));
  const emailResults = await Promise.allSettled(emailJobs);
  emailResults.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[notifications/email] Notification email delivery failed", result.reason);
    }
  });
}

export async function notifyCardSubscribers({
  cardId,
  actorId,
  eventType,
  title,
  body,
  clientVisibleActivity = false,
}: Omit<NotifyInput, "recipientIds" | "dedupeKey">) {
  const subscriptions = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      members: { select: { userId: true } },
      watchers: { select: { userId: true } },
    },
  });
  if (!subscriptions) return;
  await notifyUsers({
    cardId,
    actorId,
    eventType,
    title,
    body,
    clientVisibleActivity,
    recipientIds: [
      ...subscriptions.members.map(({ userId }) => userId),
      ...subscriptions.watchers.map(({ userId }) => userId),
    ],
  });
}

export async function notifyApprovalClients({
  cardId,
  actorId,
}: {
  cardId: string;
  actorId: string;
}) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      title: true,
      visibility: true,
      list: {
        select: {
          board: {
            select: {
              members: { where: { role: "CLIENT" }, select: { userId: true } },
              workspace: { select: { members: { where: { role: "CLIENT" }, select: { userId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!card || card.visibility !== "CLIENT_VISIBLE") return;
  await notifyUsers({
    cardId,
    actorId,
    eventType: "APPROVAL_REQUESTED",
    title: "Approval requested",
    body: `"${card.title}" is ready for your review.`,
    clientVisibleActivity: true,
    recipientIds: Array.from(new Set([
      ...card.list.board.workspace.members.map(({ userId }) => userId),
      ...card.list.board.members.map(({ userId }) => userId),
    ])),
  });
}

export async function notifyTeamOfClientApproval({
  cardId,
  eventType,
  title,
  actorId,
}: {
  cardId: string;
  eventType: "APPROVED" | "CHANGES_REQUESTED";
  title: string;
  actorId?: string | null;
}) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      title: true,
      list: {
        select: {
          board: {
            select: {
              members: { where: { role: { not: "CLIENT" } }, select: { userId: true } },
              workspace: {
                select: { members: { where: { role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!card) return;
  await notifyUsers({
    cardId,
    actorId,
    eventType,
    title,
    body: `"${card.title}" ${eventType === "APPROVED" ? "was approved" : "has changes requested"}.`,
    clientVisibleActivity: true,
    recipientIds: [
      ...card.list.board.members.map(({ userId }) => userId),
      ...card.list.board.workspace.members.map(({ userId }) => userId),
    ],
  });
}

export function isNotificationEvent(value: string): value is NotificationEvent {
  return (notificationEvents as readonly string[]).includes(value);
}
