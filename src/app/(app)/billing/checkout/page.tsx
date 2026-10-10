import { redirect } from "next/navigation";
import { z } from "zod";
import { CheckoutPage } from "@/components/billing/checkout-page";

const planSchema = z.enum(["STARTER", "TEAM", "AGENCY"]);

export default function BillingCheckoutRoute({ searchParams }: { searchParams: { plan?: string } }) {
  const plan = planSchema.safeParse(searchParams.plan);
  if (!plan.success) redirect("/plans");
  return <CheckoutPage planKey={plan.data} clientToken={process.env.PADDLE_CLIENT_TOKEN ?? ""} environment={process.env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production"} />;
}
