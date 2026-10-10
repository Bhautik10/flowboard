import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { BILLING_PLANS, isSubscriptionActive } from "@/lib/billing";
import { isMissingTableError } from "@/lib/prisma-errors";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { planKey: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    });
    const plan = subscription && isSubscriptionActive(subscription.status) && subscription.planKey in BILLING_PLANS
      ? BILLING_PLANS[subscription.planKey as keyof typeof BILLING_PLANS]
      : null;
    return NextResponse.json({
      plan: plan ? { key: subscription?.planKey, name: plan.name } : { key: "FREE", name: "Free" },
      subscription: subscription ? { status: subscription.status, active: isSubscriptionActive(subscription.status), currentPeriodEnd: subscription.currentPeriodEnd, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null,
      billingReady: true,
    });
  } catch (error) {
    if (isMissingTableError(error, "Subscription")) return NextResponse.json({ plan: { key: "FREE", name: "Free" }, subscription: null, billingReady: false });
    console.error("[billing/current] Could not load subscription", error);
    return NextResponse.json({ error: "Current plan could not be loaded." }, { status: 500 });
  }
}
