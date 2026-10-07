import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function hashClientShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveClientShareToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return prisma.clientShareLink.findFirst({
    where: {
      tokenHash: hashClientShareToken(token),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      board: { select: { id: true, title: true, workspaceId: true } },
    },
  });
}
