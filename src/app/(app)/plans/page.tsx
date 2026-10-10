import { PlansPage } from "@/components/billing/plans-page";

export default function PlansRoute({ searchParams }: { searchParams: { checkout?: string } }) {
  const checkoutConfigured = Boolean(
    process.env.PADDLE_API_KEY && process.env.PADDLE_CLIENT_TOKEN && process.env.PADDLE_WEBHOOK_SECRET &&
    process.env.PADDLE_STARTER_MONTHLY_PRICE_ID && process.env.PADDLE_TEAM_MONTHLY_PRICE_ID && process.env.PADDLE_AGENCY_MONTHLY_PRICE_ID,
  );
  return <PlansPage checkoutComplete={searchParams.checkout === "completed"} checkoutConfigured={checkoutConfigured} />;
}
