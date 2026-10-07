import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";

const mentionPattern = /@\[[^\]]{1,100}\]\((c[a-zA-Z0-9]{20,})\)/g;

export function extractMentionedUserIds(value: string) {
  return Array.from(new Set(Array.from(value.matchAll(mentionPattern), (match) => match[1])));
}

export async function notifyMentionedMembers({
  text,
  cardId,
  workspaceId,
  actorId,
  previouslyMentioned = [],
  clientVisibleActivity = false,
}: {
  text: string;
  cardId: string;
  workspaceId: string;
  actorId: string;
  previouslyMentioned?: string[];
  clientVisibleActivity?: boolean;
}) {
  const previousIds = new Set(previouslyMentioned);
  const userIds = extractMentionedUserIds(text).filter((id) => id !== actorId && !previousIds.has(id));
  if (!userIds.length) return;
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      userId: { in: userIds },
    },
    select: { userId: true, role: true },
  });
  const validUserIds = Array.from(new Set(members.map(({ userId }) => userId)));
  if (!validUserIds.length) return;
  await notifyUsers({
    cardId,
    recipientIds: validUserIds,
    actorId,
    eventType: "MENTION",
    title: "You were mentioned",
    body: "You were mentioned on a card.",
    clientVisibleActivity,
  });
}
