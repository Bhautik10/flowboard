"use client";

import Script from "next/script";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Globe2, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BILLING_PLANS, type PaidPlanKey } from "@/lib/billing";

type PaddleEvent = { name: string };
type PaddleWindow = Window & {
  Paddle?: {
    Environment: { set: (environment: "sandbox") => void };
    Initialize: (config: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
    Checkout: { open: (config: { transactionId: string; settings: { successUrl: string } }) => void };
  };
};

export function CheckoutPage({ planKey, clientToken, environment }: { planKey: PaidPlanKey; clientToken: string; environment: "sandbox" | "production" }) {
  const plan = BILLING_PLANS[planKey];
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  function initializePaddle() {
    if (!clientToken) return;
    const paddle = (window as PaddleWindow).Paddle;
    if (!paddle || initialized.current) return;
    if (environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({
      token: clientToken,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") router.replace("/plans?checkout=completed");
      },
    });
    initialized.current = true;
    setScriptReady(true);
  }

  async function startCheckout() {
    if (!clientToken) {
      toast.error("Secure checkout is not configured yet.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not start secure checkout.");
      initializePaddle();
      const paddle = (window as PaddleWindow).Paddle;
      if (!paddle) throw new Error("Checkout is still loading. Please try again in a moment.");
      paddle.Checkout.open({ transactionId: data.transactionId, settings: { successUrl: `${window.location.origin}/plans?checkout=completed` } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start secure checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onReady={initializePaddle} onError={() => toast.error("Secure checkout could not load. Check your connection and retry.")} />
      <Link href="/plans" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to plans</Link>
      <div><p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">Secure checkout</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Review your plan</h1><p className="mt-2 text-sm text-muted-foreground">Your payment details are collected by Paddle’s secure checkout.</p></div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8"><div className="flex items-start justify-between gap-4 border-b pb-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Monthly subscription</p><h2 className="mt-2 text-2xl font-semibold">{plan.name}</h2><p className="mt-1 text-sm text-muted-foreground">{plan.description}</p></div><div className="shrink-0 text-right"><div className="text-3xl font-semibold">{plan.priceLabel}</div><div className="text-xs text-muted-foreground">per month</div></div></div>
          <ul className="space-y-3 py-5">{plan.features.map((feature) => <li key={feature} className="flex items-center gap-2.5 text-sm"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"><Check className="h-3 w-3" /></span>{feature}</li>)}</ul>
          <div className="rounded-xl bg-muted/60 p-4"><div className="flex items-start justify-between text-sm"><span className="text-muted-foreground">Subscription</span><span>{plan.priceLabel} / month</span></div><div className="mt-2 flex items-start justify-between border-t pt-3 text-sm font-semibold"><span>Due today</span><span>{plan.priceLabel} + applicable tax</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Your exact total and supported local currency are shown by Paddle before you confirm payment.</p></div>
        </section>
        <aside className="flex flex-col rounded-2xl border bg-gradient-to-b from-indigo-50 to-white p-6 dark:from-indigo-950/40 dark:to-card sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25"><CreditCard className="h-5 w-5" /></div><h2 className="mt-5 text-lg font-semibold">Continue to payment</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Paddle securely handles checkout, payment methods, and tax calculations for supported markets.</p><div className="mt-5 space-y-3 text-xs text-muted-foreground"><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-emerald-600" />Encrypted payment details</div><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Plan activates after verified payment</div><div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-emerald-600" />Localized checkout in supported countries</div></div><Button type="button" onClick={startCheckout} disabled={loading || !scriptReady || !clientToken} className="mt-8 h-12 w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_100%] font-semibold text-white shadow-lg shadow-indigo-600/25 transition-[background-position] hover:bg-right disabled:opacity-50">{loading ? <Loader2 className="animate-spin" /> : <LockKeyhole />}Continue securely</Button>{!clientToken && <p role="alert" className="mt-3 text-xs text-destructive">The public Paddle client token has not been configured.</p>}{!scriptReady && clientToken && <p className="mt-3 text-center text-xs text-muted-foreground">Loading secure payment window…</p>}<p className="mt-auto pt-5 text-center text-[11px] leading-5 text-muted-foreground">FlowBoard does not store your full card number or security code.</p></aside>
      </div>
    </div>
  );
}
