-- CreateTable
CREATE TABLE "ShopSetup" (
    "shopDomain" TEXT NOT NULL PRIMARY KEY,
    "themeEmbedDone" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
