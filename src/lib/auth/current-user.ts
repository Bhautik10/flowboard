import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await auth();
  const userId = session?.user?.id;
  const tokenVersion = session?.user?.tokenVersion;
  if (!userId || typeof tokenVersion !== "number") return null;

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!currentUser || currentUser.tokenVersion !== tokenVersion) return null;

  return session.user;
}
