-- CreateTable
CREATE TABLE "PuzzleGift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "puzzleConfigId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "badgeLabel" TEXT,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PuzzleGift_puzzleConfigId_fkey" FOREIGN KEY ("puzzleConfigId") REFERENCES "PuzzleConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PuzzleGift_puzzleConfigId_idx" ON "PuzzleGift"("puzzleConfigId");
