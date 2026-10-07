import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { notificationEvents, notificationPreferencesSchema } from "@/lib/validations/notifications";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
      select: { eventType: true, inApp: true, email: true },
    });
    const existing = new Map(rows.map((row) => [row.eventType, row]));
    return NextResponse.json({
      preferences: notificationEvents.map((eventType) => ({
        eventType,
        inApp: existing.get(eventType)?.inApp ?? true,
        email: existing.get(eventType)?.email ?? false,
      })),
    });
  } catch (error) {
    console.error("[notifications/preferences] Failed to load settings", { userId: user.id, error });
    return NextResponse.json({ error: "Could not load notification settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = notificationPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    await prisma.$transaction(parsed.data.preferences.map((preference) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId: user.id, eventType: preference.eventType } },
        create: { userId: user.id, ...preference },
        update: { inApp: preference.inApp, email: preference.email },
      }),
    ));
    return NextResponse.json({ preferences: parsed.data.preferences });
  } catch (error) {
    console.error("[notifications/preferences] Failed to save settings", { userId: user.id, error });
    return NextResponse.json({ error: "Could not save notification settings" }, { status: 500 });
  }
}
