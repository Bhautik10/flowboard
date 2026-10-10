import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { BILLING_PLANS, isSubscriptionActive, paddleApiBaseUrl } from "@/lib/billing";
import { isMissingTableError } from "@/lib/prisma-errors";

const checkoutSchema = z.object({ planKey: z.enum(["STARTER", "TEAM", "AGENCY"]) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const apiKey = process.env.PADDLE_API_KEY;
  const priceId = process.env[BILLING_PLANS[parsed.data.planKey].priceEnvironmentKey];
  if (!apiKey || !priceId || !process.env.PADDLE_CLIENT_TOKEN || !process.env.PADDLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Secure checkout is not configured yet." }, { status: 503 });
  }

  try {
    const existing = await prisma.subscription.findUnique({ where: { userId: user.id }, select: { status: true } });
    if (existing && isSubscriptionActive(existing.status)) {
      return NextResponse.json({ error: "An active plan is already attached to this account." }, { status: 409 });
    }
    const recentCheckout = await prisma.billingCheckout.findFirst({
      where: { userId: user.id, processedAt: null },
      orderBy: { createdAt: "desc" },
      select: { providerTransactionId: true, planKey: true },
    });
    if (recentCheckout) {
      if (recentCheckout.planKey === parsed.data.planKey) {
        return NextResponse.json({ transactionId: recentCheckout.providerTransactionId });
      }
      return NextResponse.json({ error: "A secure checkout is already pending for this account. Finish or close it before choosing another plan." }, { status: 409 });
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) return NextResponse.json({ error: "Checkout return URL is not configured." }, { status: 503 });
    const response = await fetch(`${paddleApiBaseUrl()}/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: "automatic",
        custom_data: { flowboard_user_id: user.id, flowboard_plan_key: parsed.data.planKey },
        checkout: { url: `${baseUrl.replace(/\/$/, "")}/billing/checkout?plan=${parsed.data.planKey}` },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { data?: { id?: string }; error?: { detail?: string } } | null;
    const transactionId = payload?.data?.id;
    if (!response.ok || !transactionId || !/^txn_[a-z\d]{26}$/.test(transactionId)) {
      console.error("[billing/checkout] Paddle transaction creation failed", { status: response.status, message: payload?.error?.detail });
      return NextResponse.json({ error: "Secure checkout could not be started. Please try again." }, { status: 502 });
    }
    await prisma.billingCheckout.create({ data: { userId: user.id, providerTransactionId: transactionId, planKey: parsed.data.planKey, priceId } });
    return NextResponse.json({ transactionId }, { status: 201 });
  } catch (error) {
    if (isMissingTableError(error, "Subscription") || isMissingTableError(error, "BillingCheckout")) {
      return NextResponse.json({ error: "Billing database setup is pending. Apply the additive billing migration after the earlier pending migration is cleared." }, { status: 503 });
    }
    console.error("[billing/checkout] Could not start checkout", error);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
