CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");
CREATE UNIQUE INDEX "BillingCheckout_providerTransactionId_key" ON "BillingCheckout"("providerTransactionId");
CREATE INDEX "BillingCheckout_userId_createdAt_idx" ON "BillingCheckout"("userId", "createdAt");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
