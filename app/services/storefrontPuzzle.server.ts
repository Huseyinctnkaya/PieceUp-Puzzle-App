import {
  getActivePuzzleConfig,
  getPuzzleConfigById,
} from "../models/puzzleConfig.server";
import { getRunningExperiment } from "../models/experiment.server";
import { assignVariant } from "../lib/variantAssignment";

/**
 * The puzzle a given shopper should be shown.
 *
 * The single resolver for all three storefront endpoints. `config` renders it,
 * `track` counts an open against it and `complete` reads the chosen gift's
 * discount from it — and if any of the three could reach a different answer
 * for the same shopper, they would be shown one puzzle, counted against a
 * second and rewarded from a third. One function is what makes that
 * impossible.
 *
 * A running experiment outranks `isActive`. The variants are named by the
 * experiment, so neither has to be the shop's single active puzzle and the
 * one-active-puzzle rule stays intact. Their own start and end dates are
 * ignored while the test runs: the experiment's own window is the schedule.
 */
export async function getPuzzleForShopper(
  shopDomain: string,
  identityKey: string | null,
) {
  const experiment = await getRunningExperiment(shopDomain);

  // Without an identity there is no stable bucket to put this shopper in, and
  // assigning them afresh each request would show them a different puzzle
  // every time. Older widgets cached by a theme don't send one; they keep
  // playing the shop's usual puzzle and simply sit outside the experiment.
  if (experiment && identityKey) {
    const variant = assignVariant(
      identityKey,
      experiment.id,
      experiment.splitPercent,
    );
    const puzzleId =
      variant === "A" ? experiment.variantAId : experiment.variantBId;

    // Null rather than a fallback when the variant has gone missing. Quietly
    // serving the active puzzle instead would pour this half of the
    // experiment's traffic into a third campaign, and the results would look
    // perfectly ordinary while measuring something that never happened.
    return getPuzzleConfigById(shopDomain, puzzleId);
  }

  return getActivePuzzleConfig(shopDomain);
}
