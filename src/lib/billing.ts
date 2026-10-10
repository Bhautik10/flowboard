import { prisma } from "@/lib/prisma";

export type PublicPaidPlanKey = "STARTER" | "TEAM" | "AGENCY";
export type LegacyPaidPlanKey = "PRO";
export type PaidPlanKey = PublicPaidPlanKey | LegacyPaidPlanKey;
export type BillingPlanKey = "FREE" | PaidPlanKey;

type BillingPlan = {
  name: string;
  priceLabel: string;
  amountUsd: number;
  description: string;
  features: string[];
  seats: number | null;
  clientSharing: boolean;
  priceEnvironmentKey: "PADDLE_STARTER_MONTHLY_PRICE_ID" | "PADDLE_TEAM_MONTHLY_PRICE_ID" | "PADDLE_AGENCY_MONTHLY_PRICE_ID" | "PADDLE_PRO_MONTHLY_PRICE_ID";
};

export const BILLING_PLANS: Record<PaidPlanKey, BillingPlan> = {
  STARTER: {
    name: "Solo",
    priceLabel: "$10",
    amountUsd: 10,
    description: "A focused workspace for one person.",
    features: ["1 workspace member", "Unlimited boards, lists, and cards", "Board, table, calendar, and timeline views"],
    seats: 1,
    clientSharing: false,
    priceEnvironmentKey: "PADDLE_STARTER_MONTHLY_PRICE_ID",
  },
  TEAM: {
    name: "Team",
    priceLabel: "$18",
    amountUsd: 18,
    description: "Room for a team of up to ten members.",
    features: ["Up to 10 workspace members", "Unlimited boards, lists, and cards", "Advanced views, filters, and time tracking"],
    seats: 10,
    clientSharing: false,
    priceEnvironmentKey: "PADDLE_TEAM_MONTHLY_PRICE_ID",
  },
  AGENCY: {
    name: "Agency",
    priceLabel: "$25",
    amountUsd: 25,
    description: "Everything FlowBoard offers, with clients included.",
    features: ["Unlimited workspace members", "Client card sharing and approvals", "All features, views, and reports", "Unlimited boards, lists, and cards"],
    seats: null,
    clientSharing: true,
    priceEnvironmentKey: "PADDLE_AGENCY_MONTHLY_PRICE_ID",
  },
  // Existing PRO subscriptions remain readable and can continue receiving provider webhooks.
  PRO: {
    name: "Studio (legacy)",
    priceLabel: "$12",
    amountUsd: 12,
    description: "Legacy Studio subscription.",
    features: ["Up to 10 workspace members", "Unlimited boards, lists, and cards", "Advanced views and reports"],
    seats: 10,
    clientSharing: false,
    priceEnvironmentKey: "PADDLE_PRO_MONTHLY_PRICE_ID",
  },
};

export const PUBLIC_PAID_PLAN_KEYS: PublicPaidPlanKey[] = ["STARTER", "TEAM", "AGENCY"];

export function getBillingPlanRank(planKey: BillingPlanKey) {
  if (planKey === "FREE") return 0;
  if (planKey === "STARTER") return 1;
  if (planKey === "TEAM" || planKey === "PRO") return 2;
  return 3;
}

export async function getWorkspaceBillingEntitlements(workspaceId: string) {
  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER" },
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return { planKey: "FREE" as const, seats: 1, clientSharing: false };
  let subscription: { planKey: string; status: string } | null = null;
  try {
    subscription = await prisma.subscription.findUnique({
      where: { userId: owner.userId },
      select: { planKey: true, status: true },
    });
  } catch (error) {
    // Until billing storage is installed, use the restrictive one-seat default.
    console.error("[billing/entitlements] Could not read subscription", error);
  }
  const planKey = subscription?.planKey;
  const plan = subscription && isSubscriptionActive(subscription.status) && planKey && planKey in BILLING_PLANS
    ? BILLING_PLANS[planKey as PaidPlanKey]
    : null;
  return {
    planKey: plan && planKey ? planKey as BillingPlanKey : "FREE" as const,
    seats: plan?.seats ?? 1,
    clientSharing: plan?.clientSharing ?? false,
  };
}

export async function getWorkspaceMemberLimitError(workspaceId: string, role: string, excludingInviteEmail?: string) {
  const entitlements = await getWorkspaceBillingEntitlements(workspaceId);
  if (role === "CLIENT") {
    return entitlements.clientSharing ? null : "Client sharing is included with the Agency plan.";
  }
  if (entitlements.seats === null) return null;
  const [memberCount, pendingInviteCount] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId, role: { not: "CLIENT" } } }),
    prisma.workspaceInvite.count({
      where: {
        workspaceId,
        role: { not: "CLIENT" },
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        ...(excludingInviteEmail ? { email: { not: excludingInviteEmail.toLowerCase() } } : {}),
      },
    }),
  ]);
  return memberCount + pendingInviteCount >= entitlements.seats
    ? `${BILLING_PLANS[entitlements.planKey as PaidPlanKey]?.name ?? "Your current plan"} allows ${entitlements.seats} workspace member${entitlements.seats === 1 ? "" : "s"}. Upgrade to invite more people.`
    : null;
}

export function paddleApiBaseUrl() {
  return process.env.PADDLE_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

export function getPlanForPrice(priceId: string): PaidPlanKey | null {
  for (const key of Object.keys(BILLING_PLANS) as PaidPlanKey[]) {
    if (process.env[BILLING_PLANS[key].priceEnvironmentKey] === priceId) return key;
  }
  return null;
}

export function isSubscriptionActive(status: string) {
  return status === "active" || status === "trialing";
}
