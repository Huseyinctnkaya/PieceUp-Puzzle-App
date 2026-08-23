-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PuzzleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Puzzle',
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
INSERT INTO "new_PuzzleConfig" ("createdAt", "endDate", "id", "imageUrl", "isActive", "pieceCount", "playLimitType", "rewardType", "rewardValue", "shopDomain", "startDate", "triggerDelaySeconds", "triggerMode", "triggerPage", "updatedAt") SELECT "createdAt", "endDate", "id", "imageUrl", "isActive", "pieceCount", "playLimitType", "rewardType", "rewardValue", "shopDomain", "startDate", "triggerDelaySeconds", "triggerMode", "triggerPage", "updatedAt" FROM "PuzzleConfig";
DROP TABLE "PuzzleConfig";
ALTER TABLE "new_PuzzleConfig" RENAME TO "PuzzleConfig";
CREATE INDEX "PuzzleConfig_shopDomain_idx" ON "PuzzleConfig"("shopDomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
