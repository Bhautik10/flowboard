import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPlanForPrice } from "@/lib/billing";
import { isMissingTableError } from "@/lib/prisma-errors";

const eventSchema = z.object({
  event_id: z.string().regex(/^evt_[a-z\d]{26}$/),
  event_type: z.enum([
    "subscription.created", "subscription.updated", "subscription.activated",
    "subscription.trialing", "subscription.past_due", "subscription.paused",
    "subscription.resumed", "subscription.canceled",
  ]),
  occurred_at: z.string().datetime({ offset: true }),
  data: z.record(z.unknown()),
}).strict();

const subscriptionSchema = z.object({
  id: z.string().regex(/^sub_[a-z\d]{26}$/),
  status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]),
  customer_id: z.string().regex(/^ctm_[a-z\d]{26}$/),
  transaction_id: z.string().regex(/^txn_[a-z\d]{26}$/).optional(),
  custom_data: z.record(z.unknown()).nullable().optional(),
  items: z.array(z.object({ price: z.object({ id: z.string().regex(/^pri_[a-z\d]{26}$/) }) })).min(1),
  current_billing_period: z.object({ ends_at: z.string().datetime({ offset: true }) }).nullable().optional(),
  scheduled_change: z.object({ action: z.string() }).nullable().optional(),
}).passthrough();

function validSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = header.split(";").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("ts="))?.slice(3);
  const signatures = parts.filter((part) => part.startsWith("h1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest();
  return signatures.some((signature) => {
    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("Paddle-Signature"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const eventResult = eventSchema.safeParse(body);
  if (!eventResult.success) return NextResponse.json({ error: eventResult.error.flatten() }, { status: 400 });
  const event = eventResult.data;
  const parsedSubscription = subscriptionSchema.safeParse(event.data);
  if (!parsedSubscription.success) return NextResponse.json({ error: "Invalid subscription event" }, { status: 400 });
  const providerSubscription = parsedSubscription.data;
  const priceId = providerSubscription.items[0]?.price.id;
  const planKey = priceId ? getPlanForPrice(priceId) : null;
  if (!priceId || !planKey) return NextResponse.json({ error: "Subscription price is not configured" }, { status: 400 });
  const customUserId = providerSubscription.custom_data?.flowboard_user_id;
  const occurredAt = new Date(event.occurred_at);
  const currentPeriodEnd = providerSubscription.current_billing_period?.ends_at
    ? new Date(providerSubscription.current_billing_period.ends_at)
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.billingWebhookEvent.create({ data: { eventId: event.event_id, eventType: event.event_type, occurredAt } });
      const existing = await tx.subscription.findUnique({
        where: { providerSubscriptionId: providerSubscription.id },
        select: { id: true, userId: true, lastEventAt: true },
      });
      let userId = existing?.userId;
      if (!userId && event.event_type === "subscription.created" && providerSubscription.transaction_id) {
        const checkout = await tx.billingCheckout.findUnique({ where: { providerTransactionId: providerSubscription.transaction_id } });
        if (checkout && checkout.priceId === priceId && (!customUserId || customUserId === checkout.userId)) {
          userId = checkout.userId;
          await tx.billingCheckout.update({ where: { id: checkout.id }, data: { processedAt: occurredAt } });
        }
      }
      if (!userId && !existing && event.event_type !== "subscription.created" && typeof customUserId === "string" && z.string().cuid().safeParse(customUserId).success) {
        const checkout = await tx.billingCheckout.findFirst({
          where: { userId: customUserId, priceId, processedAt: null, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: "desc" },
        });
        if (checkout) {
          userId = checkout.userId;
          await tx.billingCheckout.update({ where: { id: checkout.id }, data: { processedAt: occurredAt } });
        }
      }
      if (!userId) throw new Error("Paddle subscription could not be matched to a FlowBoard account");
      if (existing && existing.userId !== userId) throw new Error("Paddle subscription account does not match the saved subscription");
      if (existing && existing.lastEventAt >= occurredAt) return;
      const currentForUser = await tx.subscription.findUnique({ where: { userId }, select: { providerSubscriptionId: true, status: true } });
      if (currentForUser && currentForUser.providerSubscriptionId !== providerSubscription.id && ["active", "trialing", "past_due"].includes(currentForUser.status)) {
        throw new Error("A second active Paddle subscription cannot replace the current subscription");
      }
      await tx.subscription.upsert({
        where: { userId },
        create: {
          userId,
          providerSubscriptionId: providerSubscription.id,
          providerCustomerId: providerSubscription.customer_id,
          planKey,
          priceId,
          status: providerSubscription.status,
          currentPeriodEnd,
          cancelAtPeriodEnd: providerSubscription.scheduled_change?.action === "cancel",
          lastEventAt: occurredAt,
        },
        update: {
          providerSubscriptionId: providerSubscription.id,
          providerCustomerId: providerSubscription.customer_id,
          planKey,
          priceId,
          status: providerSubscription.status,
          currentPeriodEnd,
          cancelAtPeriodEnd: providerSubscription.scheduled_change?.action === "cancel",
          lastEventAt: occurredAt,
        },
      });
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const received = await prisma.billingWebhookEvent.findUnique({ where: { eventId: event.event_id }, select: { eventId: true } }).catch(() => null);
      if (received) return NextResponse.json({ received: true, duplicate: true });
    }
    if (isMissingTableError(error, "Subscription") || isMissingTableError(error, "BillingCheckout") || isMissingTableError(error, "BillingWebhookEvent")) {
      return NextResponse.json({ error: "Billing database migration is not applied" }, { status: 503 });
    }
    console.error("[billing/webhook] Could not process signed Paddle event", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
