import { describe, expect, it } from "vitest";
import {
  addHint,
  canPull,
  createState,
  isEndDocked,
  isOnTrack,
  isSolved,
  key,
  occupancy,
  removeHint,
  reset,
  tryPull,
  visibleHintMarks,
} from "../src";
import type { Puzzle } from "../src";

/**
 * Minimal 6x6 test puzzle: one 3-block train, word "CAT" across at y=1.
 * The movement track = play cells + train start footprint + the declared
 * trackCells corridor; everything else on the grid is scenery.
 */
const base: Puzzle = {
  id: "test",
  title: "Test",
  levelNumber: 0,
  gridWidth: 6,
  gridHeight: 6,
  trackCells: [
    { x: 4, y: 3 },
    { x: 0, y: 3 },
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 5, y: 4 },
  ],
  playCells: [
    { x: 1, y: 1, letter: "C" },
    { x: 2, y: 1, letter: "A" },
    { x: 3, y: 1, letter: "T" },
  ],
  trains: [
    {
      id: "t",
      color: "#8fc31f",
      letters: ["T", "A", "C"],
      start: [
        { x: 3, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
      ],
    },
  ],
  hints: [
    { cell: { x: 3, y: 1 }, trainId: "t", end: "head" },
    { cell: { x: 1, y: 1 }, trainId: "t", end: "tail" },
  ],
  defaultVisibleHints: 1,
  clues: [
    {
      direction: "across",
      cells: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ],
      answer: "CAT",
      text: "Meows",
    },
  ],
};

describe("tryPull — snake-follow movement", () => {
  it("pulls the head into an adjacent empty cell; body follows", () => {
    const s0 = createState(base);
    const s1 = tryPull(s0, "t", "head", { x: 4, y: 3 })!;
    expect(s1).not.toBeNull();
    expect(s1.trains[0].cells).toEqual([
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ]);
    expect(s1.moves).toBe(1);
    // original state untouched (immutability)
    expect(s0.trains[0].cells[0]).toEqual({ x: 3, y: 3 });
  });

  it("pulls the tail; blocks shift toward the tail", () => {
    const s0 = createState(base);
    const s1 = tryPull(s0, "t", "tail", { x: 0, y: 3 })!;
    expect(s1.trains[0].cells).toEqual([
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ]);
  });

  it("follows an L-shaped pull around a corner", () => {
    const s0 = createState(base);
    const s1 = tryPull(s0, "t", "head", { x: 3, y: 2 })!;
    const s2 = tryPull(s1, "t", "head", { x: 3, y: 1 })!;
    expect(s2.trains[0].cells).toEqual([
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it("rejects non-adjacent targets", () => {
    const s0 = createState(base);
    expect(tryPull(s0, "t", "head", { x: 5, y: 3 })).toBeNull();
    expect(tryPull(s0, "t", "head", { x: 4, y: 4 })).toBeNull(); // diagonal
  });

  it("rejects out-of-bounds and blocked cells", () => {
    const p: Puzzle = { ...base, blocked: [{ x: 4, y: 3 }] };
    const s0 = createState(p);
    expect(tryPull(s0, "t", "head", { x: 4, y: 3 })).toBeNull(); // blocked
    const s1 = tryPull(s0, "t", "tail", { x: 0, y: 3 })!;
    expect(tryPull(s1, "t", "tail", { x: -1, y: 3 })).toBeNull(); // off grid
  });

  it("cannot pull off the track — plain grid cells are scenery", () => {
    const s0 = createState(base);
    // (3,4) is adjacent to the head but not a play cell, start cell, or trackCell.
    expect(canPull(s0, "t", "head", { x: 3, y: 4 })).toBe(false);
    expect(tryPull(s0, "t", "head", { x: 3, y: 4 })).toBeNull();
  });

  it("track = play cells + start footprint + declared trackCells", () => {
    expect(isOnTrack(base, { x: 2, y: 1 })).toBe(true); // play cell
    expect(isOnTrack(base, { x: 2, y: 3 })).toBe(true); // start footprint
    expect(isOnTrack(base, { x: 4, y: 3 })).toBe(true); // declared corridor
    expect(isOnTrack(base, { x: 3, y: 4 })).toBe(false); // scenery
    expect(isOnTrack(base, { x: 0, y: 0 })).toBe(false); // scenery
  });

  it("cannot pull into its own body (no pushing, no self-overlap)", () => {
    const s0 = createState(base);
    // head at (3,3); (2,3) is its own second block
    expect(canPull(s0, "t", "head", { x: 2, y: 3 })).toBe(false);
  });

  it("cannot pull into another train", () => {
    const p: Puzzle = {
      ...base,
      playCells: [...base.playCells, { x: 4, y: 3, letter: "X" }],
      trains: [
        ...base.trains,
        { id: "x", color: "#29abe2", letters: ["X"], start: [{ x: 4, y: 3 }] },
      ],
    };
    const s0 = createState(p);
    expect(tryPull(s0, "t", "head", { x: 4, y: 3 })).toBeNull();
  });

  it("handles a length-1 train (head and tail are the same block)", () => {
    const p: Puzzle = {
      ...base,
      playCells: [...base.playCells, { x: 0, y: 0, letter: "X" }],
      trains: [
        ...base.trains,
        { id: "x", color: "#29abe2", letters: ["X"], start: [{ x: 5, y: 5 }] },
      ],
    };
    const s0 = createState(p);
    const s1 = tryPull(s0, "x", "head", { x: 5, y: 4 })!;
    expect(s1.trains[1].cells).toEqual([{ x: 5, y: 4 }]);
    const s2 = tryPull(s1, "x", "tail", { x: 5, y: 5 })!;
    expect(s2.trains[1].cells).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("win condition", () => {
  /** Head T threads the word from the left: ends T(3,1) A(2,1) C(1,1) = CAT. */
  const solveRoute = [
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ];

  it("stays unsolved mid-route, solves at the end, and counts moves", () => {
    let s = createState(base);
    for (const [i, target] of solveRoute.entries()) {
      const next = tryPull(s, "t", "head", target);
      expect(next, `step ${i} to ${key(target)}`).not.toBeNull();
      s = next!;
      expect(s.solved).toBe(i === solveRoute.length - 1);
    }
    expect(isSolved(s)).toBe(true);
    expect(s.moves).toBe(6);
    expect(s.trains[0].cells).toEqual([
      { x: 3, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it("freezes input after solving", () => {
    let s = createState(base);
    for (const target of solveRoute) s = tryPull(s, "t", "head", target)!;
    expect(tryPull(s, "t", "tail", { x: 0, y: 1 })).toBeNull();
    expect(canPull(s, "t", "head", { x: 3, y: 2 })).toBe(false);
  });

  it("isEndDocked: notch fits per-end as soon as that end rests on its mark", () => {
    let s = createState(base);
    expect(isEndDocked(s, "t", "head")).toBe(false);
    expect(isEndDocked(s, "t", "tail")).toBe(false);
    // Walk the head onto (3,1) — its mark — via the corridor; the head docks
    // exactly at the final step, and the tail (C on (1,1)) docks too.
    for (const [i, target] of solveRoute.entries()) {
      s = tryPull(s, "t", "head", target)!;
      expect(isEndDocked(s, "t", "head")).toBe(i === solveRoute.length - 1);
    }
    expect(isEndDocked(s, "t", "tail")).toBe(true);
  });

  it("does not solve when letters land in the wrong order", () => {
    // Head T straight up: T(3,1) A(3,2) C(3,3) — occupies only one slot.
    let s = createState(base);
    s = tryPull(s, "t", "head", { x: 3, y: 2 })!;
    s = tryPull(s, "t", "head", { x: 3, y: 1 })!;
    expect(s.solved).toBe(false);
  });
});

describe("hints — ADD / REMOVE dial", () => {
  it("starts at defaultVisibleHints and clamps at both ends", () => {
    let s = createState(base);
    expect(visibleHintMarks(s)).toHaveLength(1);
    s = addHint(s);
    expect(visibleHintMarks(s)).toHaveLength(2);
    s = addHint(s); // beyond max
    expect(visibleHintMarks(s)).toHaveLength(2);
    s = removeHint(s);
    s = removeHint(s);
    s = removeHint(s); // below zero
    expect(visibleHintMarks(s)).toHaveLength(0);
  });

  it("reveals hints in puzzle order", () => {
    let s = createState(base);
    expect(visibleHintMarks(s)[0].end).toBe("head");
    s = addHint(s);
    expect(visibleHintMarks(s)[1].end).toBe("tail");
  });
});

describe("reset and occupancy", () => {
  it("reset restores the starting layout and zeroes moves", () => {
    let s = createState(base);
    s = tryPull(s, "t", "head", { x: 4, y: 3 })!;
    s = addHint(s);
    const r = reset(s);
    expect(r.trains[0].cells).toEqual(base.trains[0].start);
    expect(r.moves).toBe(0);
    expect(r.visibleHints).toBe(base.defaultVisibleHints);
  });

  it("occupancy maps every block with head/tail flags", () => {
    const s = createState(base);
    const occ = occupancy(s);
    expect(occ.size).toBe(3);
    expect(occ.get(key({ x: 3, y: 3 }))).toMatchObject({ letter: "T", isHead: true });
    expect(occ.get(key({ x: 1, y: 3 }))).toMatchObject({ letter: "C", isTail: true });
    expect(occ.get(key({ x: 2, y: 3 }))).toMatchObject({ isHead: false, isTail: false });
  });
});
