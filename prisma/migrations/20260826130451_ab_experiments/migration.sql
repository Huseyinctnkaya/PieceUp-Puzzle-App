-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantAId" TEXT NOT NULL,
    "variantBId" TEXT NOT NULL,
    "splitPercent" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Experiment_shopDomain_status_idx" ON "Experiment"("shopDomain", "status");
