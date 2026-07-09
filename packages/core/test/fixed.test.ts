import { describe, expect, it } from "vitest";
import {
  createState,
  isSolved,
  occupancy,
  tryPull,
  validatePuzzle,
  key,
} from "../src";
import type { Puzzle } from "../src";

/**
 * A tiny puzzle exercising immovable pre-filled blocks. The word is "FIX"
 * across (3 cells). The middle cell "I" is a fixed block; two single-block
 * trains bring "F" and "X" up from the row below, either side of the lock.
 */
function fixPuzzle(): Puzzle {
  return {
    id: "fixed-test",
    title: "Fixed test",
    levelNumber: 0,
    gridWidth: 10,
    gridHeight: 8,
    trackCells: [
      { x: 4, y: 3 },
      { x: 6, y: 3 },
    ],
    fixedBlocks: [{ x: 5, y: 2 }],
    playCells: [
      { x: 4, y: 2, letter: "F" },
      { x: 5, y: 2, letter: "I" },
      { x: 6, y: 2, letter: "X" },
    ],
    trains: [
      { id: "f", color: "#8fc31f", letters: ["F"], start: [{ x: 4, y: 3 }] },
      { id: "x", color: "#29abe2", letters: ["X"], start: [{ x: 6, y: 3 }] },
    ],
    hints: [],
    defaultVisibleHints: 0,
    clues: [],
  };
}

describe("immovable fixed blocks", () => {
  it("a fixed block validates when it sits on a play cell", () => {
    expect(validatePuzzle(fixPuzzle())).toEqual([]);
  });

  it("a fixed block appears in occupancy carrying its cell's letter", () => {
    const occ = occupancy(createState(fixPuzzle()));
    const fb = occ.get(key({ x: 5, y: 2 }));
    expect(fb?.isFixed).toBe(true);
    expect(fb?.letter).toBe("I");
  });

  it("a train cannot pull onto a fixed block", () => {
    let s = createState(fixPuzzle());
    s = tryPull(s, "f", "head", { x: 4, y: 2 })!;
    expect(s).not.toBeNull();
    expect(tryPull(s, "f", "head", { x: 5, y: 2 })).toBeNull();
  });

  it("the crossword solves with the fixed block filling its own cell", () => {
    let s = createState(fixPuzzle());
    s = tryPull(s, "f", "head", { x: 4, y: 2 })!;
    s = tryPull(s, "x", "head", { x: 6, y: 2 })!;
    expect(isSolved(s)).toBe(true);
    expect(s.solved).toBe(true);
  });

  it("rejects a fixed block that is not on a play cell", () => {
    const p = fixPuzzle();
    p.fixedBlocks = [{ x: 0, y: 0 }];
    expect(validatePuzzle(p).some((e) => /not on a play cell/.test(e))).toBe(true);
  });

  it("rejects a train start sitting on a fixed block", () => {
    const p = fixPuzzle();
    p.playCells.push({ x: 4, y: 3, letter: "F" });
    p.fixedBlocks = [{ x: 5, y: 2 }, { x: 4, y: 3 }];
    expect(
      validatePuzzle(p).some((e) => /sits on an immovable block/.test(e)),
    ).toBe(true);
  });
});
