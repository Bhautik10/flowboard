import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  confirmation: z.literal("DELETE"),
});

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type DELETE to confirm account removal" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const ownedWorkspaces = await tx.workspaceMember.findMany({
      where: { userId: user.id, role: "OWNER" },
      select: { workspaceId: true },
    });
    if (ownedWorkspaces.length) {
      await tx.workspace.deleteMany({
        where: { id: { in: ownedWorkspaces.map((membership) => membership.workspaceId) } },
      });
    }
    await tx.user.delete({ where: { id: user.id } });
  });
  return NextResponse.json({ success: true });
}
