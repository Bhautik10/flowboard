CREATE TABLE "CardClient" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "clientUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardClient_cardId_clientUserId_key" ON "CardClient"("cardId", "clientUserId");
CREATE INDEX "CardClient_clientUserId_idx" ON "CardClient"("clientUserId");
CREATE INDEX "CardClient_cardId_idx" ON "CardClient"("cardId");

ALTER TABLE "CardClient" ADD CONSTRAINT "CardClient_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardClient" ADD CONSTRAINT "CardClient_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
