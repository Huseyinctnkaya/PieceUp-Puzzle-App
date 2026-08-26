export type Variant = "A" | "B";

/**
 * FNV-1a, 32-bit.
 *
 * Chosen for being stable rather than for being strong: the same shopper has
 * to land in the same bucket on every request, for months, across restarts and
 * deploys — so the function cannot change and cannot depend on anything but
 * its input. There is nothing to attack here; a shopper who worked out how to
 * force themselves into variant A would win the right to see a different
 * jigsaw.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    // The FNV prime, via shifts because a plain multiply overflows into
    // floating point and loses the low bits that make the hash uniform.
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which variant a shopper sees, decided from their identity alone.
 *
 * Nothing is stored. The assignment is recomputed on every request and comes
 * out the same, which keeps a shopper's experience consistent without writing
 * a row per visitor — cheaper, and it leaves no record of who saw what.
 *
 * The experiment id is mixed into the hash so each experiment shuffles the
 * crowd afresh. Without it the same shoppers would sit in variant A of every
 * test the shop ever runs, and one unrepresentative group would colour every
 * result.
 */
export function assignVariant(
  identityKey: string,
  experimentId: string,
  splitPercent: number,
): Variant {
  // A split outside the range means a bug upstream. Falling back to even keeps
  // the experiment running and comparable rather than quietly routing all
  // traffic one way and producing a result that looks real.
  const split =
    Number.isFinite(splitPercent) && splitPercent >= 0 && splitPercent <= 100
      ? splitPercent
      : 50;

  return hash(`${experimentId}:${identityKey}`) % 100 < split ? "A" : "B";
}
