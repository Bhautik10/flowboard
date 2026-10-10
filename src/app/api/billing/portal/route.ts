import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSubscriptionActive, paddleApiBaseUrl } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { isMissingTableError } from "@/lib/prisma-errors";

const requestSchema = z.object({ action: z.enum(["manage", "payment-method"]) }).strict();
const portalSchema = z.object({
  data: z.object({
    urls: z.object({
      general: z.object({ overview: z.string().url() }),
      subscriptions: z.array(z.object({
        id: z.string().regex(/^sub_[a-z\d]{26}$/),
        view_subscription: z.string().url(),
        update_subscription_payment_method: z.string().url(),
      }).passthrough()),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

function isPaddleHostedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "paddle.com" || url.hostname.endsWith(".paddle.com"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Secure billing management is not configured yet." }, { status: 503 });

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { providerCustomerId: true, providerSubscriptionId: true, status: true },
    });
    if (!subscription || !isSubscriptionActive(subscription.status)) {
      return NextResponse.json({ error: "An active subscription is required to manage payment details." }, { status: 409 });
    }
    const response = await fetch(`${paddleApiBaseUrl()}/customers/${subscription.providerCustomerId}/portal-sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_ids: [subscription.providerSubscriptionId] }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.json().catch(() => null);
    const result = portalSchema.safeParse(body);
    if (!response.ok || !result.success) {
      console.error("[billing/portal] Paddle portal session failed", { status: response.status });
      return NextResponse.json({ error: "Paddle could not open secure billing management. Please retry." }, { status: 502 });
    }
    const portalSubscription = result.data.data.urls.subscriptions.find((item) => item.id === subscription.providerSubscriptionId);
    const destination = parsed.data.action === "payment-method"
      ? portalSubscription?.update_subscription_payment_method
      : portalSubscription?.view_subscription ?? result.data.data.urls.general.overview;
    if (!destination || !isPaddleHostedUrl(destination)) {
      console.error("[billing/portal] Paddle returned an invalid portal link");
      return NextResponse.json({ error: "Paddle returned an invalid billing link. Please retry." }, { status: 502 });
    }
    return NextResponse.json({ url: destination });
  } catch (error) {
    if (isMissingTableError(error, "Subscription")) {
      return NextResponse.json({ error: "Billing database setup is pending. Payment management is not available yet." }, { status: 503 });
    }
    console.error("[billing/portal] Could not create billing portal session", error);
    return NextResponse.json({ error: "Could not open billing management. Please try again." }, { status: 500 });
  }
}
