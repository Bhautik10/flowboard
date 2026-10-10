import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const parsed = z.string().regex(/^[a-f0-9]{64}$/).safeParse(token);
  if (!parsed.success) return NextResponse.redirect(new URL("/profile?email=invalid", request.url));
  const record = await prisma.emailChangeToken.findUnique({ where: { token: parsed.data } });
  if (!record || record.expires <= new Date()) return NextResponse.redirect(new URL("/profile?email=expired", request.url));
  const conflict = await prisma.user.findUnique({ where: { email: record.email }, select: { id: true } });
  if (conflict && conflict.id !== record.userId) return NextResponse.redirect(new URL("/profile?email=taken", request.url));
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { email: record.email, emailVerified: new Date(), tokenVersion: { increment: 1 } } });
      await tx.emailChangeToken.deleteMany({ where: { userId: record.userId } });
    });
    return NextResponse.redirect(new URL("/profile?email=verified", request.url));
  } catch (error) {
    console.error("[auth/verify-email]", error);
    return NextResponse.redirect(new URL("/profile?email=taken", request.url));
  }
}
