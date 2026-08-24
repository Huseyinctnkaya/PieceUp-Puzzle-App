-- CreateTable
CREATE TABLE "PuzzleStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "rewarded" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "PuzzleStat_shopDomain_date_idx" ON "PuzzleStat"("shopDomain", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleStat_shopDomain_puzzleId_date_key" ON "PuzzleStat"("shopDomain", "puzzleId", "date");
