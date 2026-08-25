-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "playDate" TEXT NOT NULL,
    "limitKey" TEXT NOT NULL DEFAULT 'ever',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "discountCode" TEXT,
    "prizeTitle" TEXT,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Backfilled from playDate rather than left at the 'ever' default. A shop set
-- to one play a day would otherwise have every past player collapse onto the
-- same key, locking them out of the puzzle permanently. The date is correct
-- for both existing limits: one-a-day matches on it, and one-ever does not
-- read it at all.
INSERT INTO "new_PlayRecord" ("completed", "discountCode", "id", "identityKey", "playDate", "limitKey", "playedAt", "prizeTitle", "shopDomain") SELECT "completed", "discountCode", "id", "identityKey", "playDate", "playDate", "playedAt", "prizeTitle", "shopDomain" FROM "PlayRecord";
DROP TABLE "PlayRecord";
ALTER TABLE "new_PlayRecord" RENAME TO "PlayRecord";
CREATE UNIQUE INDEX "PlayRecord_shopDomain_identityKey_limitKey_key" ON "PlayRecord"("shopDomain", "identityKey", "limitKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
