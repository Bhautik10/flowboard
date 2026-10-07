import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUpSchema } from "@/lib/validations/auth";
import { hashPassword } from "@/lib/auth/password";
import { ensureDefaultWorkspace } from "@/lib/workspaces";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("[auth/register] Could not parse registration request", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = signUpSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return NextResponse.json(
        { error: { email: ["An account with this email already exists"] } },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });
    try {
      await ensureDefaultWorkspace(user.id, user.name);
    } catch (error) {
      console.error(
        "[auth/register] Account was created but default workspace creation failed",
        error,
      );
      return NextResponse.json(
        { error: "Account created, but workspace setup failed. Please sign in to retry." },
        { status: 500 },
      );
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[auth/register] Account registration failed", error);
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 },
    );
  }
}
