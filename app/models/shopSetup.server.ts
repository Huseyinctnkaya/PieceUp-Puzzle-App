import db from "../db.server";

export async function isThemeEmbedDone(shopDomain: string) {
  const row = await db.shopSetup.findUnique({ where: { shopDomain } });
  return row?.themeEmbedDone ?? false;
}

export async function setThemeEmbedDone(shopDomain: string, done: boolean) {
  await db.shopSetup.upsert({
    where: { shopDomain },
    create: { shopDomain, themeEmbedDone: done },
    update: { themeEmbedDone: done },
  });
}
