-- CreateTable
CREATE TABLE "PuzzleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "imageUrl" TEXT,
    "pieceCount" INTEGER NOT NULL DEFAULT 9,
    "rewardType" TEXT NOT NULL DEFAULT 'PERCENTAGE_DISCOUNT',
    "rewardValue" TEXT NOT NULL DEFAULT '10',
    "triggerMode" TEXT NOT NULL DEFAULT 'BUTTON',
    "triggerPage" TEXT NOT NULL DEFAULT 'ALL',
    "triggerDelaySeconds" INTEGER,
    "playLimitType" TEXT NOT NULL DEFAULT 'ONCE_EVER',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlayRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "playDate" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "discountCode" TEXT,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleConfig_shopDomain_key" ON "PuzzleConfig"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "PlayRecord_shopDomain_identityKey_playDate_key" ON "PlayRecord"("shopDomain", "identityKey", "playDate");
