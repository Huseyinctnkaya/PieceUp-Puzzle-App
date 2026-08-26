/**
 * The statistics behind the A/B results page.
 *
 * Kept separate and pure so it can be checked against worked examples. An A/B
 * tool that reports a winner it has not earned is worse than no A/B tool at
 * all — the merchant acts on it — so every function here would rather say "not
 * yet" than guess.
 */

/** Below this many visitors a variant gets no verdict, however large the gap. */
export const MIN_SAMPLE_PER_VARIANT = 100;

/** The usual 95% bar. A result at or under this is called significant. */
const ALPHA = 0.05;

/** z for a two-tailed 95% test, and for 80% power. */
const Z_ALPHA = 1.959964;
const Z_POWER = 0.841621;

/**
 * Error function, Abramowitz & Stegun 7.1.26.
 *
 * JavaScript has no erf, and every p-value here needs one. Accurate to about
 * 1.5e-7, which is orders of magnitude finer than the decision it feeds: the
 * only question asked of it is which side of 0.05 a number falls on.
 */
function erf(x: number): number {
  const sign = Math.sign(x);
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-z * z));
}

/** P(Z ≤ z) for a standard normal. */
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Two-tailed p-value for a z (or, at large samples, a t) statistic. */
function twoTailedP(statistic: number): number {
  return 2 * (1 - normalCdf(Math.abs(statistic)));
}

export type Proportion = { successes: number; total: number };

/** Summary statistics for a variant, enough to recover mean and variance. */
export type Sample = {
  /** Visitors, including everyone who spent nothing. */
  n: number;
  sum: number;
  sumOfSquares: number;
};

export type Comparison = {
  /** False when a variant is too small to judge; everything else is then moot. */
  enoughData: boolean;
  /** Null when no test could be run. */
  pValue: number | null;
  significant: boolean;
  /** Which variant is ahead on the raw numbers, regardless of significance. */
  leader: "A" | "B" | null;
};

/**
 * Two-proportion z-test — for completion rate and the like.
 *
 * Pooled variance under the null hypothesis that both variants share one true
 * rate, which is the standard form and the conservative one.
 */
export function compareProportions(
  a: Proportion,
  b: Proportion,
): Comparison & { rateA: number; rateB: number } {
  const rateA = a.total > 0 ? a.successes / a.total : 0;
  const rateB = b.total > 0 ? b.successes / b.total : 0;
  const leader = rateA === rateB ? null : rateA > rateB ? "A" : "B";

  const enoughData =
    a.total >= MIN_SAMPLE_PER_VARIANT && b.total >= MIN_SAMPLE_PER_VARIANT;
  if (!enoughData) {
    return { enoughData: false, pValue: null, significant: false, leader, rateA, rateB };
  }

  const pooled = (a.successes + b.successes) / (a.total + b.total);
  const standardError = Math.sqrt(
    pooled * (1 - pooled) * (1 / a.total + 1 / b.total),
  );
  // Both variants at exactly 0% or exactly 100%: there is no variance to
  // divide by, and no difference to detect either.
  if (standardError === 0) {
    return { enoughData: true, pValue: 1, significant: false, leader, rateA, rateB };
  }

  const pValue = twoTailedP((rateB - rateA) / standardError);
  return {
    enoughData: true,
    pValue,
    significant: pValue <= ALPHA,
    leader,
    rateA,
    rateB,
  };
}

/** Sample variance from summary statistics, or 0 when there is nothing to vary. */
function varianceOf(sample: Sample): number {
  if (sample.n < 2) return 0;
  const corrected =
    sample.sumOfSquares - (sample.sum * sample.sum) / sample.n;
  // Floating-point subtraction of two large, close numbers can land just below
  // zero. A negative variance is arithmetic noise, not a value.
  return Math.max(0, corrected / (sample.n - 1));
}

/**
 * Welch's t-test on revenue per visitor.
 *
 * Welch rather than Student because the two variants have no reason to share a
 * variance — a campaign that wins bigger orders is more volatile as well as
 * larger, and assuming otherwise would overstate confidence.
 *
 * The p-value comes from the normal distribution rather than a t-distribution.
 * They diverge only at small degrees of freedom, and by then
 * `MIN_SAMPLE_PER_VARIANT` has already withheld the verdict — at a hundred
 * visitors a side the two agree to more decimal places than this decision uses.
 *
 * One caveat worth stating: the visitor count is popup opens, so a shopper who
 * opens twice counts twice, and the two are not independent. With the usual
 * one-play-per-shopper limit the difference is negligible; with unlimited
 * replays this test is mildly optimistic.
 */
export function compareMeans(
  a: Sample,
  b: Sample,
): Comparison & { meanA: number; meanB: number } {
  const meanA = a.n > 0 ? a.sum / a.n : 0;
  const meanB = b.n > 0 ? b.sum / b.n : 0;
  const leader = meanA === meanB ? null : meanA > meanB ? "A" : "B";

  const enoughData =
    a.n >= MIN_SAMPLE_PER_VARIANT && b.n >= MIN_SAMPLE_PER_VARIANT;
  if (!enoughData) {
    return { enoughData: false, pValue: null, significant: false, leader, meanA, meanB };
  }

  const standardError = Math.sqrt(varianceOf(a) / a.n + varianceOf(b) / b.n);
  // No variance anywhere means every visitor in both variants spent the same,
  // so there is nothing for a test to distinguish.
  if (standardError === 0) {
    return { enoughData: true, pValue: null, significant: false, leader, meanA, meanB };
  }

  const pValue = twoTailedP((meanB - meanA) / standardError);
  return {
    enoughData: true,
    pValue,
    significant: pValue <= ALPHA,
    leader,
    meanA,
    meanB,
  };
}

/**
 * Visitors still needed per variant to settle a difference this size, at 95%
 * confidence and 80% power.
 *
 * The point is not precision — it is telling a merchant whether waiting a
 * fortnight will answer the question or whether the gap is too small to ever
 * prove, so they can stop the test and spend the traffic on something else.
 *
 * Returns null when the two rates are identical: no number of visitors
 * separates them, and any figure offered would be a lie.
 */
export function visitorsNeededForProportions(
  rateA: number,
  rateB: number,
  visitorsSoFar: number,
): number | null {
  const delta = Math.abs(rateA - rateB);
  if (delta === 0) return null;

  const required =
    ((Z_ALPHA + Z_POWER) ** 2 *
      (rateA * (1 - rateA) + rateB * (1 - rateB))) /
    (delta * delta);

  return Math.max(0, Math.ceil(required - visitorsSoFar));
}
