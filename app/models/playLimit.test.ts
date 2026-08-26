import { describe, it, expect, beforeEach } from "vitest";
import db from "../db.server";
import { hasAlreadyPlayed, recordCompletion } from "./playRecord.server";

const SHOP = "limits.myshopify.com";
const SHOPPER = "device:abc";

beforeEach(async () => {
  await db.playRecord.deleteMany({ where: { shopDomain: SHOP } });
});

function play(limit: "ONCE_EVER" | "ONCE_PER_DAY" | "UNLIMITED") {
  return recordCompletion({
    shopDomain: SHOP,
    identityKey: SHOPPER,
    puzzleId: "puzzle-1",
    discountCode: "PIECEUP-X",
    prizeTitle: "Prize",
    playLimitType: limit,
  });
}

describe("play limits", () => {
  it("lets a shopper play again and again when there is no limit", async () => {
    await play("UNLIMITED");
    await play("UNLIMITED");
    await play("UNLIMITED");

    // The database refuses a duplicate key, so unlimited only works if each
    // play is counted against something of its own — the second would
    // otherwise throw and the shopper would be told they had already played.
    expect(await hasAlreadyPlayed(SHOP, SHOPPER, "UNLIMITED")).toBe(false);
    expect(
      await db.playRecord.count({ where: { shopDomain: SHOP } }),
    ).toBe(3);
  });

  it("stops a shopper who has had their one go", async () => {
    await play("ONCE_EVER");
    expect(await hasAlreadyPlayed(SHOP, SHOPPER, "ONCE_EVER")).toBe(true);
  });

  it("refuses a second go on the same key even if the check is bypassed", async () => {
    await play("ONCE_EVER");
    // The check can lose a race with itself; the unique index cannot. This is
    // what stops two simultaneous completions minting two codes.
    await expect(play("ONCE_EVER")).rejects.toThrow();
  });

  it("counts a daily limit against today rather than for ever", async () => {
    await play("ONCE_PER_DAY");
    expect(await hasAlreadyPlayed(SHOP, SHOPPER, "ONCE_PER_DAY")).toBe(true);

    // Yesterday's play must not block today's, which is the whole difference
    // between this limit and the once-ever one.
    await db.playRecord.updateMany({
      where: { shopDomain: SHOP },
      data: { limitKey: "2020-01-01" },
    });
    expect(await hasAlreadyPlayed(SHOP, SHOPPER, "ONCE_PER_DAY")).toBe(false);
  });

  it("still remembers an unlimited shopper's plays for the analytics", async () => {
    await play("UNLIMITED");
    await play("UNLIMITED");

    // No limit is not the same as no record: the prize breakdown is built from
    // these, and dropping them would leave the merchant blind.
    const rows = await db.playRecord.findMany({ where: { shopDomain: SHOP } });
    expect(rows.every((row) => row.prizeTitle === "Prize")).toBe(true);
  });
});
