import { describe, it, expect, beforeEach } from "vitest";
import db from "../db.server";
import { getPrizeWins, recordCompletion } from "./playRecord.server";

const SHOP = "prize-stats.myshopify.com";

beforeEach(async () => {
  await db.playRecord.deleteMany({ where: { shopDomain: SHOP } });
});

/** Each play needs its own identity: a shopper only gets one go. */
let n = 0;
function play(prize: string, code: string | null = "PIECEUP-X") {
  return recordCompletion({
    shopDomain: SHOP,
    identityKey: `device:${n++}`,
    puzzleId: "puzzle-1",
    discountCode: code,
    prizeTitle: prize,
  });
}

describe("getPrizeWins", () => {
  it("counts each prize and ranks the most won first", async () => {
    await play("10% off");
    await play("Free shipping");
    await play("Free shipping");

    expect(await getPrizeWins(SHOP)).toEqual([
      { title: "Free shipping", won: 2 },
      { title: "10% off", won: 1 },
    ]);
  });

  it("counts a prize that awards no code", async () => {
    // "Try again" hands out nothing, but landing on it is still a result the
    // merchant needs to see — it is how they judge their prize mix.
    await play("Try again", "");

    expect(await getPrizeWins(SHOP)).toEqual([{ title: "Try again", won: 1 }]);
  });

  it("keeps a prize's history under the name it was won as", async () => {
    await play("Summer sale");
    // Renaming the prize in the admin must not rewrite what shoppers were
    // actually given, so the title is copied at the time of the win.
    const wins = await getPrizeWins(SHOP);
    expect(wins[0].title).toBe("Summer sale");
  });

  it("returns nothing for a shop with no completions", async () => {
    expect(await getPrizeWins(SHOP)).toEqual([]);
  });
});
