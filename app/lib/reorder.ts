/**
 * Moves an item to a new position in a list.
 *
 * Removes and reinserts rather than swapping the two positions: dragging a row
 * across several others should slide those others along by one, where a swap
 * would fling the row at the destination back to where the drag started.
 *
 * Returns the original list when the move is a no-op or out of range, so a
 * caller can pass a drag's coordinates in without checking them first.
 */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
