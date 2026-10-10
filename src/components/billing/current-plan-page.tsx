"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, CalendarClock, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingPlanKey } from "@/lib/billing";

type CurrentBilling = {
  plan: { key: BillingPlanKey; name: string };
  subscription: { status: string; active: boolean; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  billingReady: boolean;
};

export function CurrentPlanPage() {
  const [portalLoading, setPortalLoading] = useState<"manage" | "payment-method" | null>(null);
  const current = useQuery<CurrentBilling>({
    queryKey: ["billing-current"],
    queryFn: async () => {
      const response = await fetch("/api/billing/current", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load current plan");
      return data;
    },
  });

  async function openBillingPortal(action: "manage" | "payment-method") {
    setPortalLoading(action);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") throw new Error(typeof data.error === "string" ? data.error : "Could not open secure billing.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open secure billing.");
      setPortalLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/plans" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to plans</Link>
      <header><p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">Account billing</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Current plan</h1><p className="mt-2 text-sm text-muted-foreground">See your active subscription and billing period.</p></header>
      {current.isLoading && <div className="flex min-h-52 items-center justify-center rounded-2xl border bg-card"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /><span className="ml-2 text-sm text-muted-foreground">Loading your plan…</span></div>}
      {current.isError && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6"><p className="text-sm text-destructive">Your plan could not be loaded.</p><Button variant="outline" className="mt-4" onClick={() => void current.refetch()}>Try again</Button></div>}
      {current.data && <>
        {!current.data.billingReady && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Billing storage is awaiting its additive database migration. No payment will activate until provider confirmation is saved.</div>}
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-4 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-7 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-indigo-100">Your plan</p><h2 className="mt-1 text-2xl font-semibold">{current.data.plan.name}</h2></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold"><BadgeCheck className="h-4 w-4" />{current.data.subscription?.active ? "ACTIVE" : current.data.plan.key === "FREE" ? "FREE PLAN" : current.data.subscription?.status.toUpperCase() ?? "INACTIVE"}</span></div>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="flex items-start gap-3"><span className="rounded-lg bg-muted p-2"><CreditCard className="h-4 w-4" /></span><div><p className="text-sm font-medium">Subscription status</p><p className="mt-1 text-sm capitalize text-muted-foreground">{current.data.subscription?.status.replaceAll("_", " ") ?? "No paid subscription"}</p></div></div>
            <div className="flex items-start gap-3"><span className="rounded-lg bg-muted p-2"><CalendarClock className="h-4 w-4" /></span><div><p className="text-sm font-medium">Current period ends</p><p className="mt-1 text-sm text-muted-foreground">{current.data.subscription?.currentPeriodEnd ? new Date(current.data.subscription.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: "long" }) : "Not applicable"}</p></div></div>
          </div>
          {current.data.subscription?.cancelAtPeriodEnd && <p className="mx-6 mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">Cancellation is scheduled at the end of this billing period.</p>}
          <div className="flex flex-col gap-4 border-t p-6 sm:flex-row sm:items-center sm:justify-between"><p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />Card details are entered securely on Paddle and never stored by FlowBoard.</p><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" disabled={!current.data.billingReady || !current.data.subscription?.active || portalLoading !== null} onClick={() => void openBillingPortal("payment-method")} className="rounded-xl">{portalLoading === "payment-method" ? <Loader2 className="animate-spin" /> : <CreditCard />}{portalLoading === "payment-method" ? "Opening…" : "Add or update card"}</Button><Button type="button" variant="outline" disabled={!current.data.billingReady || !current.data.subscription?.active || portalLoading !== null} onClick={() => void openBillingPortal("manage")} className="rounded-xl">{portalLoading === "manage" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{portalLoading === "manage" ? "Opening…" : "Manage subscription"}</Button><Button asChild className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20 hover:from-indigo-500 hover:to-violet-500"><Link href="/plans">View plans / upgrade</Link></Button></div></div>
        </section>
      </>}
    </div>
  );
}
