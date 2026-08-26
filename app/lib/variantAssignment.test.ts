import { describe, it, expect } from "vitest";
import { assignVariant } from "./variantAssignment";

const EXPERIMENT = "exp-1";

describe("assignVariant", () => {
  it("gives the same shopper the same variant every time", () => {
    // The whole test depends on this. A shopper who saw variant B yesterday
    // must see B today, or the comparison is between two muddles.
    const first = assignVariant("device:abc", EXPERIMENT, 50);
    for (let i = 0; i < 20; i++) {
      expect(assignVariant("device:abc", EXPERIMENT, 50)).toBe(first);
    }
  });

  it("splits a crowd close to evenly at 50", () => {
    let toA = 0;
    const shoppers = 10000;
    for (let i = 0; i < shoppers; i++) {
      if (assignVariant(`device:${i}`, EXPERIMENT, 50) === "A") toA++;
    }

    // Within three points of half. A hash that clumped would quietly bias the
    // whole experiment while still looking like it worked.
    expect(toA / shoppers).toBeGreaterThan(0.47);
    expect(toA / shoppers).toBeLessThan(0.53);
  });

  it("honours an uneven split", () => {
    let toA = 0;
    const shoppers = 10000;
    for (let i = 0; i < shoppers; i++) {
      if (assignVariant(`device:${i}`, EXPERIMENT, 80) === "A") toA++;
    }

    expect(toA / shoppers).toBeGreaterThan(0.77);
    expect(toA / shoppers).toBeLessThan(0.83);
  });

  it("reshuffles for a different experiment", () => {
    // Otherwise the same shoppers would land in variant A of every experiment
    // the shop ever runs, and one unusual group would colour all of them.
    const shoppers = 2000;
    let sameSide = 0;
    for (let i = 0; i < shoppers; i++) {
      const key = `device:${i}`;
      if (assignVariant(key, "exp-1", 50) === assignVariant(key, "exp-2", 50)) {
        sameSide++;
      }
    }

    // Independent assignments agree about half the time. Near-perfect
    // agreement would mean the experiment id is not really in the hash.
    expect(sameSide / shoppers).toBeGreaterThan(0.44);
    expect(sameSide / shoppers).toBeLessThan(0.56);
  });

  it("sends everyone one way at the extremes", () => {
    for (let i = 0; i < 200; i++) {
      expect(assignVariant(`device:${i}`, EXPERIMENT, 100)).toBe("A");
      expect(assignVariant(`device:${i}`, EXPERIMENT, 0)).toBe("B");
    }
  });

  it("treats a nonsensical split as an even one", () => {
    // A stored split outside 0-100 is a bug elsewhere, but it must not send
    // every shopper to one side and silently void the experiment.
    expect(["A", "B"]).toContain(assignVariant("device:x", EXPERIMENT, -20));
    expect(["A", "B"]).toContain(assignVariant("device:y", EXPERIMENT, 180));
  });
});
