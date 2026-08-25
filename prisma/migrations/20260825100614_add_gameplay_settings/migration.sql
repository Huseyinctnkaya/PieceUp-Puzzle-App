-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PuzzleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Puzzle',
    "badgeLabel" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "pieceCount" INTEGER NOT NULL DEFAULT 9,
    "knobSize" INTEGER NOT NULL DEFAULT 24,
    "difficulty" TEXT NOT NULL DEFAULT 'easy',
    "trayPosition" TEXT NOT NULL DEFAULT 'right',
    "accentColor" TEXT NOT NULL DEFAULT '#1a1a1a',
    "showGuide" BOOLEAN NOT NULL DEFAULT true,
    "wrongPieceBehaviour" TEXT NOT NULL DEFAULT 'return',
    "timeLimitSeconds" INTEGER,
    "shuffleLimit" INTEGER NOT NULL DEFAULT 0,
    "showMoves" BOOLEAN NOT NULL DEFAULT true,
    "rememberProgress" BOOLEAN NOT NULL DEFAULT true,
    "confetti" BOOLEAN NOT NULL DEFAULT true,
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
INSERT INTO "new_PuzzleConfig" ("badgeLabel", "createdAt", "description", "endDate", "headline", "id", "imageUrl", "isActive", "name", "pieceCount", "playLimitType", "rewardType", "rewardValue", "shopDomain", "startDate", "triggerDelaySeconds", "triggerMode", "triggerPage", "updatedAt") SELECT "badgeLabel", "createdAt", "description", "endDate", "headline", "id", "imageUrl", "isActive", "name", "pieceCount", "playLimitType", "rewardType", "rewardValue", "shopDomain", "startDate", "triggerDelaySeconds", "triggerMode", "triggerPage", "updatedAt" FROM "PuzzleConfig";
DROP TABLE "PuzzleConfig";
ALTER TABLE "new_PuzzleConfig" RENAME TO "PuzzleConfig";
CREATE INDEX "PuzzleConfig_shopDomain_idx" ON "PuzzleConfig"("shopDomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
