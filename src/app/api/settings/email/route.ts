import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { verifyPassword } from "@/lib/auth/password";

const schema = z.object({ email: z.string().trim().email().max(254), currentPassword: z.string().min(1).max(128) }).strict();
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }

async function getPending() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const pending = await prisma.emailChangeToken.findFirst({ where: { userId: user.id, expires: { gt: new Date() } }, select: { email: true, expires: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ pending });
}

async function requestEmailChange(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const [current, duplicate] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { email: true, name: true, passwordHash: true } }),
    prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } }),
  ]);
  if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!current.passwordHash || !(await verifyPassword(parsed.data.currentPassword, current.passwordHash))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  if (duplicate && duplicate.id !== user.id) return NextResponse.json({ error: "That email address is already in use" }, { status: 409 });
  if (parsed.data.email.toLowerCase() === current.email.toLowerCase()) return NextResponse.json({ error: "Enter a different email address" }, { status: 400 });
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.emailChangeToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailChangeToken.create({ data: { userId: user.id, email: parsed.data.email.toLowerCase(), token, expires } }),
  ]);
  const origin = new URL(request.url).origin;
  const verifyUrl = `${origin}/api/auth/verify-email?token=${token}`;
  const key = process.env.RESEND_API_KEY;
  if (!key) console.info("[email-change:verification-link]", { to: parsed.data.email, url: verifyUrl });
  else {
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) return NextResponse.json({ error: "Email delivery is not configured" }, { status: 503 });
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [parsed.data.email], subject: "Verify your FlowBoard email", html: `<p>Hi ${escapeHtml(current.name ?? "there")},</p><p>Confirm your new email address by opening this link. It expires in one hour.</p><p><a href="${escapeHtml(verifyUrl)}">Verify email address</a></p>` }) });
    if (!response.ok) { console.error("[email-change:resend]", await response.text()); return NextResponse.json({ error: "Could not send the verification email" }, { status: 502 }); }
  }
  return NextResponse.json({ success: true, pending: { email: parsed.data.email.toLowerCase(), expires } });
}

export async function GET() {
  try { return await getPending(); }
  catch (error) { console.error("[settings/email:get]", error); return NextResponse.json({ error: "Could not load pending email change" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { return await requestEmailChange(request); }
  catch (error) { console.error("[settings/email:request]", error); return NextResponse.json({ error: "Could not request an email change" }, { status: 500 }); }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    await prisma.emailChangeToken.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings/email:cancel]", error);
    return NextResponse.json({ error: "Could not cancel the email change" }, { status: 500 });
  }
}
