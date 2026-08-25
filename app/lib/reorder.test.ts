import { describe, it, expect } from "vitest";
import { reorder } from "./reorder";

describe("reorder", () => {
  it("moves an item forward, sliding the others back", () => {
    // A swap would give [d, b, c, a] — the item at the destination thrown to
    // where the drag started, which is not what dragging a row looks like.
    expect(reorder(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("moves an item backward, sliding the others forward", () => {
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves an item one place", () => {
    expect(reorder(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("leaves the list alone when nothing moves", () => {
    const items = ["a", "b", "c"];
    expect(reorder(items, 1, 1)).toBe(items);
  });

  it("leaves the list alone for a position that isn't in it", () => {
    const items = ["a", "b"];
    // A drag can end over anything, including outside the list, and that must
    // not scramble it or drop an item.
    expect(reorder(items, 0, 5)).toBe(items);
    expect(reorder(items, -1, 0)).toBe(items);
  });

  it("does not mutate the list it was given", () => {
    const items = ["a", "b", "c"];
    reorder(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
