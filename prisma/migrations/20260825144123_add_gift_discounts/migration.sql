-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PuzzleGift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "puzzleConfigId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "badgeLabel" TEXT,
    "imageUrl" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE_OFF_ORDER',
    "discountValue" TEXT NOT NULL DEFAULT '10',
    "productIds" TEXT NOT NULL DEFAULT '[]',
    "collectionIds" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PuzzleGift_puzzleConfigId_fkey" FOREIGN KEY ("puzzleConfigId") REFERENCES "PuzzleConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PuzzleGift" ("badgeLabel", "createdAt", "description", "id", "imageUrl", "position", "puzzleConfigId", "title") SELECT "badgeLabel", "createdAt", "description", "id", "imageUrl", "position", "puzzleConfigId", "title" FROM "PuzzleGift";
DROP TABLE "PuzzleGift";
ALTER TABLE "new_PuzzleGift" RENAME TO "PuzzleGift";
CREATE INDEX "PuzzleGift_puzzleConfigId_idx" ON "PuzzleGift"("puzzleConfigId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
