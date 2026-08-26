import { describe, it, expect } from "vitest";
import {
  compareProportions,
  compareMeans,
  visitorsNeededForProportions,
  MIN_SAMPLE_PER_VARIANT,
  type Sample,
} from "./significance";

/** Summary stats for a variant where every visitor spent the same amount. */
function flatSample(visitors: number, buyers: number, each: number): Sample {
  return {
    n: visitors,
    sum: buyers * each,
    sumOfSquares: buyers * each * each,
  };
}

describe("compareProportions", () => {
  it("finds a real difference between two large samples", () => {
    // 20% against 25% over a thousand each. Worked by hand:
    // pooled p = 450/2000 = 0.225, SE = sqrt(0.225*0.775*(2/1000)) = 0.018675,
    // z = 0.05/0.018675 = 2.677, two-tailed p = 0.0074.
    const result = compareProportions(
      { successes: 200, total: 1000 },
      { successes: 250, total: 1000 },
    );

    expect(result.pValue).toBeCloseTo(0.0074, 3);
    expect(result.significant).toBe(true);
  });

  it("does not call a small difference significant", () => {
    const result = compareProportions(
      { successes: 200, total: 1000 },
      { successes: 210, total: 1000 },
    );

    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.significant).toBe(false);
  });

  it("reports no difference as a p-value of one", () => {
    const result = compareProportions(
      { successes: 200, total: 1000 },
      { successes: 200, total: 1000 },
    );

    expect(result.pValue).toBeCloseTo(1, 5);
    expect(result.significant).toBe(false);
  });

  it("refuses to judge a sample too small to judge", () => {
    // A handful of visitors can show a huge apparent gap through luck alone.
    // Reporting a winner there is how an A/B tool talks a merchant into the
    // wrong campaign, so it declines instead.
    const result = compareProportions(
      { successes: 1, total: 10 },
      { successes: 5, total: 10 },
    );

    expect(result.enoughData).toBe(false);
    expect(result.significant).toBe(false);
  });

  it("says a variant with no visitors has no verdict", () => {
    const result = compareProportions(
      { successes: 0, total: 0 },
      { successes: 0, total: 0 },
    );

    expect(result.enoughData).toBe(false);
    expect(result.pValue).toBeNull();
  });
});

describe("compareMeans", () => {
  it("finds a difference in revenue per visitor", () => {
    // A: 100 of 1000 visitors spent 100 each. B: 150 of 1000 spent 100 each.
    // Means are 10.00 and 15.00 per visitor; with samples this size the gap is
    // far outside the noise.
    const result = compareMeans(
      flatSample(1000, 100, 100),
      flatSample(1000, 150, 100),
    );

    expect(result.meanA).toBeCloseTo(10, 6);
    expect(result.meanB).toBeCloseTo(15, 6);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("is not fooled by a bigger average built on fewer buyers", () => {
    // The trap this metric exists to catch. B's average order is far larger,
    // but so few visitors buy that revenue per visitor is barely different —
    // and the test must not crown it.
    const result = compareMeans(
      flatSample(1000, 100, 100), // 10.00 per visitor
      flatSample(1000, 11, 900), // 9.90 per visitor
    );

    expect(result.significant).toBe(false);
  });

  it("holds back until each variant has enough visitors", () => {
    const result = compareMeans(
      flatSample(MIN_SAMPLE_PER_VARIANT - 1, 20, 100),
      flatSample(MIN_SAMPLE_PER_VARIANT - 1, 5, 100),
    );

    expect(result.enoughData).toBe(false);
    expect(result.significant).toBe(false);
  });

  it("survives a variant where nobody spent anything", () => {
    // Zero variance on one side would divide by zero if it were not handled.
    const result = compareMeans(
      flatSample(1000, 0, 0),
      flatSample(1000, 100, 100),
    );

    expect(result.meanA).toBe(0);
    expect(Number.isFinite(result.pValue ?? 0)).toBe(true);
    expect(result.significant).toBe(true);
  });

  it("returns no verdict when neither variant earned anything", () => {
    const result = compareMeans(flatSample(1000, 0, 0), flatSample(1000, 0, 0));

    expect(result.significant).toBe(false);
    expect(result.pValue).toBeNull();
  });

  it("names the variant that is ahead", () => {
    expect(
      compareMeans(flatSample(1000, 100, 100), flatSample(1000, 150, 100))
        .leader,
    ).toBe("B");
    expect(
      compareMeans(flatSample(1000, 150, 100), flatSample(1000, 100, 100))
        .leader,
    ).toBe("A");
    expect(
      compareMeans(flatSample(1000, 100, 100), flatSample(1000, 100, 100))
        .leader,
    ).toBeNull();
  });
});

describe("visitorsNeededForProportions", () => {
  it("estimates the visitors still needed to settle a close race", () => {
    // Detecting 20% against 22% at 95% confidence and 80% power takes a few
    // thousand per variant — the number that tells a merchant whether waiting
    // is worth it, or whether the difference is too small to ever prove.
    const needed = visitorsNeededForProportions(0.2, 0.22, 1000);

    expect(needed).toBeGreaterThan(1000);
    expect(needed).toBeLessThan(20000);
  });

  it("asks for nobody once the sample is already large enough", () => {
    expect(visitorsNeededForProportions(0.2, 0.4, 100000)).toBe(0);
  });

  it("gives up rather than promising an unreachable number", () => {
    // Two rates that are identical would need infinite visitors. Null is the
    // honest answer: no amount of waiting will separate them.
    expect(visitorsNeededForProportions(0.2, 0.2, 1000)).toBeNull();
  });
});
