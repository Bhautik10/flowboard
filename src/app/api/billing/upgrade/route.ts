import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BILLING_PLANS, getBillingPlanRank, isSubscriptionActive, paddleApiBaseUrl, type BillingPlanKey } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { isMissingTableError } from "@/lib/prisma-errors";

const requestSchema = z.object({ planKey: z.enum(["STARTER", "TEAM", "AGENCY"]) }).strict();
const subscriptionResponseSchema = z.object({
  data: z.object({
    id: z.string().regex(/^sub_[a-z\d]{26}$/),
    customer_id: z.string().regex(/^ctm_[a-z\d]{26}$/),
    items: z.array(z.object({
      price: z.object({ id: z.string().regex(/^pri_[a-z\d]{26}$/) }),
      quantity: z.number().int().positive(),
    }).passthrough()).min(1),
  }).passthrough(),
}).passthrough();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const apiKey = process.env.PADDLE_API_KEY;
  const targetPlan = BILLING_PLANS[parsed.data.planKey];
  const priceIdResult = z.string().regex(/^pri_[a-z\d]{26}$/).safeParse(process.env[targetPlan.priceEnvironmentKey]);
  if (!apiKey || !priceIdResult.success || !process.env.PADDLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Secure plan upgrades are not configured yet." }, { status: 503 });
  }
  const targetPriceId = priceIdResult.data;

  try {
    const saved = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { providerSubscriptionId: true, planKey: true, priceId: true, status: true },
    });
    if (!saved || !isSubscriptionActive(saved.status)) {
      return NextResponse.json({ error: "An active paid subscription is required to upgrade." }, { status: 409 });
    }
    if (!(saved.planKey in BILLING_PLANS)) {
      return NextResponse.json({ error: "This legacy plan cannot be upgraded here. Contact support for help." }, { status: 409 });
    }
    if (getBillingPlanRank(parsed.data.planKey) <= getBillingPlanRank(saved.planKey as BillingPlanKey)) {
      return NextResponse.json({ error: "Choose a plan above your current plan to upgrade." }, { status: 400 });
    }

    const baseUrl = paddleApiBaseUrl();
    const subscriptionResponse = await fetch(`${baseUrl}/subscriptions/${saved.providerSubscriptionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const subscriptionBody = await subscriptionResponse.json().catch(() => null);
    const providerResult = subscriptionResponseSchema.safeParse(subscriptionBody);
    if (!subscriptionResponse.ok || !providerResult.success || providerResult.data.data.id !== saved.providerSubscriptionId) {
      console.error("[billing/upgrade] Paddle subscription lookup failed", { status: subscriptionResponse.status });
      return NextResponse.json({ error: "Could not verify your subscription with Paddle. Please retry." }, { status: 502 });
    }

    const items = providerResult.data.data.items;
    const currentPlanItems = items.filter((item) => item.price.id === saved.priceId);
    if (currentPlanItems.length !== 1) {
      return NextResponse.json({ error: "Your Paddle subscription does not match the saved plan. Contact support before upgrading." }, { status: 409 });
    }
    const updatedItems = items.map((item) => ({
      price_id: item.price.id === saved.priceId ? targetPriceId : item.price.id,
      quantity: item.quantity,
    }));
    const updateResponse = await fetch(`${baseUrl}/subscriptions/${saved.providerSubscriptionId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: updatedItems,
        proration_billing_mode: "prorated_immediately",
        on_payment_failure: "prevent_change",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const updateBody = await updateResponse.json().catch(() => null) as { error?: { code?: string; detail?: string } } | null;
    if (!updateResponse.ok) {
      console.error("[billing/upgrade] Paddle rejected subscription update", { status: updateResponse.status, code: updateBody?.error?.code });
      return NextResponse.json({ error: "The upgrade could not be charged. Update your card details and try again." }, { status: 502 });
    }
    return NextResponse.json({ success: true, plan: { key: parsed.data.planKey, name: targetPlan.name }, confirmationPending: true });
  } catch (error) {
    if (isMissingTableError(error, "Subscription")) {
      return NextResponse.json({ error: "Billing database setup is pending. A paid upgrade is not available yet." }, { status: 503 });
    }
    console.error("[billing/upgrade] Could not upgrade subscription", error);
    return NextResponse.json({ error: "Could not upgrade your plan. Please try again." }, { status: 500 });
  }
}
