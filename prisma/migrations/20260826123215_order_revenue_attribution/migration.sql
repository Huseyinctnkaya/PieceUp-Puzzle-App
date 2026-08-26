-- AlterTable
ALTER TABLE "PlayRecord" ADD COLUMN "puzzleId" TEXT;

-- A "try again" prize issues no code, but recordCompletion stored the empty
-- string for it rather than NULL. countRewardsThisMonth counts rows where the
-- code `IS NOT NULL`, and an empty string satisfies that — so every prize that
-- awarded nothing was still burning a slot in the shop's monthly reward
-- allowance. The code now writes NULL; this repairs the rows already written,
-- which would otherwise keep a Free shop capped below the 100 rewards it pays
-- for. Restricted to the empty string so real codes are untouched.
UPDATE "PlayRecord" SET "discountCode" = NULL WHERE "discountCode" = '';

-- CreateTable
CREATE TABLE "AttributedOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountCode" TEXT NOT NULL,
    "puzzleId" TEXT,
    "prizeTitle" TEXT,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "orderedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AttributedOrder_shopDomain_orderedAt_idx" ON "AttributedOrder"("shopDomain", "orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttributedOrder_shopDomain_orderId_key" ON "AttributedOrder"("shopDomain", "orderId");
