import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const notificationIdSchema = z.string().cuid();

export async function PATCH(
  _request: Request,
  { params }: { params: { notificationId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!notificationIdSchema.safeParse(params.notificationId).success) {
    return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
  }
  try {
    await prisma.notification.updateMany({
      where: { id: params.notificationId, recipientId: user.id },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications/read-one] Failed to mark notification read", { userId: user.id, error });
    return NextResponse.json({ error: "Could not update notification" }, { status: 500 });
  }
}
