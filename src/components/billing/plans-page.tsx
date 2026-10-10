"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, CircleHelp, CreditCard, Loader2, ShieldCheck, Sparkles, Users, WandSparkles } from "lucide-react";
import { BILLING_PLANS, getBillingPlanRank, PUBLIC_PAID_PLAN_KEYS, type BillingPlanKey, type PaidPlanKey, type PublicPaidPlanKey } from "@/lib/billing";
import { Button } from "@/components/ui/button";

type CurrentBilling = {
  plan: { key: BillingPlanKey; name: string };
  subscription: { status: string; active: boolean; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  billingReady: boolean;
};

export function PlansPage({ checkoutComplete = false, checkoutConfigured }: { checkoutComplete?: boolean; checkoutConfigured: boolean }) {
  const queryClient = useQueryClient();
  const [upgradingPlan, setUpgradingPlan] = useState<PublicPaidPlanKey | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PublicPaidPlanKey | null>(null);
  const current = useQuery<CurrentBilling>({
    queryKey: ["billing-current"],
    queryFn: async () => {
      const response = await fetch("/api/billing/current", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load current plan");
      return result;
    },
    refetchInterval: (query) => checkoutComplete && !query.state.data?.subscription?.active ? 4000 : pendingPlan && query.state.data?.plan.key !== pendingPlan ? 4000 : false,
  });
  const activeKey = current.data?.subscription?.active ? current.data.plan.key : "FREE";
  const paidPlan = activeKey === "FREE" ? null : BILLING_PLANS[activeKey as PaidPlanKey];
  const checkoutPending = checkoutComplete && !current.data?.subscription?.active;

  useEffect(() => {
    if (checkoutComplete && current.data?.subscription?.active) toast.success("Your plan is now active.");
  }, [checkoutComplete, current.data?.subscription?.active]);

  useEffect(() => {
    if (pendingPlan && current.data?.plan.key === pendingPlan) {
      toast.success(`${BILLING_PLANS[pendingPlan].name} is now active.`);
      setPendingPlan(null);
    }
  }, [pendingPlan, current.data?.plan.key]);

  useEffect(() => {
    if (!pendingPlan) return;
    const timeout = window.setTimeout(() => setPendingPlan(null), 120_000);
    return () => window.clearTimeout(timeout);
  }, [pendingPlan]);

  async function upgradeTo(planKey: PublicPaidPlanKey) {
    const targetPlan = BILLING_PLANS[planKey];
    if (!window.confirm(`Upgrade to ${targetPlan.name} (${targetPlan.priceLabel}/month)? Paddle will calculate the prorated amount and charge your saved payment method immediately. You can update your card from Current plan.`)) return;
    setUpgradingPlan(planKey);
    try {
      const response = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not upgrade your plan.");
      setPendingPlan(planKey);
      toast.success("Upgrade submitted. Waiting for Paddle to confirm the payment.");
      await queryClient.invalidateQueries({ queryKey: ["billing-current"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upgrade your plan.");
    } finally {
      setUpgradingPlan(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <section className="relative isolate overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-700 via-violet-700 to-slate-900 px-6 py-9 text-white shadow-xl shadow-indigo-950/10 sm:px-10 sm:py-12">
        <div aria-hidden="true" className="absolute -right-12 -top-28 -z-10 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-36 left-1/3 -z-10 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Simple plans, room to grow</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">The right plan for your next chapter.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100 sm:text-base">Choose a paid plan that fits your team. Checkout securely with locally available payment methods.</p></div>
          <Link href="/billing" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium backdrop-blur transition hover:bg-white/15"><CreditCard className="h-4 w-4" />Current plan<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {checkoutPending && <div role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-100">Checkout finished. We’re waiting for the signed provider confirmation; your plan will activate as soon as it arrives.</div>}

      <section aria-labelledby="plans-heading">
        <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 id="plans-heading" className="text-xl font-semibold">Plans for every kind of work</h2><p className="mt-1 text-sm text-muted-foreground">Monthly subscription. Taxes and supported local currencies are handled during checkout.</p></div>{current.isLoading && <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking your plan</span>}</div>
        {current.isError && <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not check your active plan. Refresh this page before purchasing.</div>}
        {current.data && !current.data.billingReady && <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Billing data setup is pending. Paid checkout stays disabled until the additive database migration is applied.</div>}
        {!checkoutConfigured && <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Paddle sandbox keys and price IDs must be configured before secure checkout can open.</div>}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PUBLIC_PAID_PLAN_KEYS.map((key) => {
            const plan = BILLING_PLANS[key];
            const isCurrent = activeKey === key;
            const canUpgrade = activeKey !== "FREE" && getBillingPlanRank(key) > getBillingPlanRank(activeKey);
            const baseBlocked = current.isLoading || current.isError || checkoutPending || (current.data !== undefined && !current.data.billingReady);
            const checkoutBlocked = baseBlocked || !checkoutConfigured || activeKey !== "FREE";
            const upgradeBlocked = baseBlocked || !checkoutConfigured || !current.data?.subscription?.active || upgradingPlan !== null || pendingPlan !== null;
            return <PlanCard key={key} name={plan.name} price={plan.priceLabel} description={plan.description} features={plan.features} featured={key === "AGENCY"} isCurrent={isCurrent} disabled={activeKey === "FREE" ? checkoutBlocked : canUpgrade ? upgradeBlocked : true} href={activeKey === "FREE" ? `/billing/checkout?plan=${key}` : null} onAction={canUpgrade ? () => void upgradeTo(key) : undefined} actionLabel={canUpgrade ? upgradingPlan === key ? "Updating plan…" : `Upgrade to ${plan.name}` : activeKey !== "FREE" && !isCurrent ? "Included in current plan" : undefined} />;
          })}
          <PlanCard name="Custom" price="Let’s talk" description="A tailored setup for larger organizations and unique workflows." features={["Custom member limits", "Plan and onboarding tailored to you", "Dedicated support"]} isCurrent={false} disabled={false} href="mailto:sales@flowboard.app?subject=FlowBoard%20custom%20plan" actionLabel="Contact sales" />
        </div>
      </section>

      <div className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-3 sm:p-6">
        <Info icon={<ShieldCheck className="h-4 w-4" />} title="Secure checkout" text="Payment details are entered with Paddle’s hosted checkout. FlowBoard never stores card numbers." />
        <Info icon={<Users className="h-4 w-4" />} title="Built for studios" text="Move from individual planning to clear, client-ready teamwork as you grow." />
        <Info icon={<CircleHelp className="h-4 w-4" />} title="Need a hand?" text="Your current plan and renewal status stay visible from the billing page." />
      </div>
      {paidPlan && <p className="text-center text-xs text-muted-foreground">Your active plan is {paidPlan.name}. Manage billing from <Link href="/billing" className="underline underline-offset-4">Current plan</Link>.</p>}
    </div>
  );
}

function PlanCard({ name, price, description, features, featured, isCurrent, disabled, href, actionLabel, onAction }: { name: string; price: string; description: string; features: string[]; featured?: boolean; isCurrent: boolean; disabled: boolean; href: string | null; actionLabel?: string; onAction?: () => void }) {
  return (
    <article className={`relative flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg ${featured ? "border-indigo-500 ring-2 ring-indigo-500/15 dark:border-indigo-400" : ""}`}>
      {featured && <div className="absolute -top-3 left-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-[11px] font-semibold text-white shadow-md"><WandSparkles className="h-3 w-3" />MOST POPULAR</div>}
      <div className="mb-5"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{name}</h3>{isCurrent && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">ACTIVE</span>}</div><p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{description}</p><div className="mt-5 flex items-end gap-1"><span className="text-4xl font-semibold tracking-tight">{price}</span>{price !== "$0" && <span className="pb-1 text-sm text-muted-foreground">/ month</span>}</div></div>
      <ul className="mb-7 flex-1 space-y-3 border-t pt-5">{features.map((feature) => <li key={feature} className="flex items-start gap-2.5 text-sm"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200"><Check className="h-3 w-3" /></span>{feature}</li>)}</ul>
      {isCurrent ? <Button disabled className="h-11 w-full rounded-xl">Current plan</Button> : onAction ? <Button type="button" onClick={onAction} disabled={disabled} className="group h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50">{actionLabel ?? `Upgrade ${name}`}<ArrowRight className="transition-transform group-hover:translate-x-1" /></Button> : href ? disabled ? <Button disabled className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold text-white opacity-50">{actionLabel ?? `Choose ${name}`}</Button> : <Button asChild className="group h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_100%] font-semibold text-white shadow-lg shadow-indigo-600/20 transition-[background-position,transform,box-shadow] hover:bg-right hover:shadow-indigo-600/30"><Link href={href}>{actionLabel ?? `Choose ${name}`}<ArrowRight className="transition-transform group-hover:translate-x-1" /></Link></Button> : <Button disabled className="h-11 w-full rounded-xl">{actionLabel ?? "Included"}</Button>}
    </article>
  );
}

function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></div>;
}
