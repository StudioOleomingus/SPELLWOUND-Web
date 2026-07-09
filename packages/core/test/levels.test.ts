import { describe, expect, it } from "vitest";
import { createState, occupancy, solve, tryPull, validatePuzzle } from "../src";
import type { End, GameState, Puzzle, Vec } from "../src";
import tutorial01 from "../../../levels/tutorial-01.json";
import tutorial02 from "../../../levels/tutorial-02.json";
import tutorial03 from "../../../levels/tutorial-03.json";
import level04 from "../../../levels/level-04.json";
import level05 from "../../../levels/level-05.json";
import level06 from "../../../levels/level-06.json";

const levels = [tutorial01, tutorial02, tutorial03, level04, level05] as unknown as Puzzle[];

/**
 * level-06 ("Courses") is the large puzzle that showcases immovable fixed
 * blocks (the two gray cells E and S). Its solution is ~39 pulls — far past
 * the BFS solver's practical budget — so it is verified here by an explicit
 * scripted walkthrough rather than the exhaustive solver.
 */
const level06Walkthrough: [string, End, number, number][] = [
  ["red", "head", 10, 16], ["red", "head", 10, 15], ["red", "head", 10, 14],
  ["red", "head", 9, 14], ["red", "head", 9, 13], ["red", "head", 10, 13],
  ["red", "head", 10, 12], ["red", "head", 9, 12], ["red", "head", 9, 11],
  ["red", "head", 9, 10], ["red", "head", 9, 9], ["red", "head", 10, 9],
  ["green", "head", 14, 17], ["green", "head", 13, 17], ["green", "head", 13, 16],
  ["green", "head", 13, 15], ["green", "head", 12, 15], ["green", "head", 11, 15],
  ["green", "head", 11, 14], ["green", "head", 11, 13],
  ["orange", "head", 14, 15], ["orange", "head", 14, 14], ["orange", "head", 13, 14],
  ["orange", "head", 12, 14], ["orange", "head", 12, 13], ["orange", "head", 12, 12],
  ["cyan", "tail", 14, 10], ["cyan", "tail", 13, 10], ["cyan", "tail", 12, 10],
  ["cyan", "tail", 12, 9], ["cyan", "tail", 11, 9], ["cyan", "tail", 11, 10],
  ["cyan", "tail", 11, 11],
  ["purple", "head", 14, 13], ["purple", "head", 14, 12], ["purple", "head", 14, 11],
  ["purple", "head", 15, 11], ["purple", "head", 15, 10], ["purple", "head", 15, 9],
];

interface Step {
  trainId: string;
  end: End;
  targets: Vec[];
}

/** Scripted walkthroughs proving each bundled level is solvable. */
const solutions: Record<string, Step[]> = {
  "tutorial-01": [
    {
      // Single train DLOCUT: head D threads the column then the row.
      trainId: "green",
      end: "head",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 2 },
        { x: 7, y: 2 },
        { x: 8, y: 2 },
        { x: 9, y: 2 },
      ],
    },
  ],
  "tutorial-02": [
    {
      // Green DLOC must clear the column before blue parks in it.
      trainId: "green",
      end: "head",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 2 },
        { x: 7, y: 2 },
        { x: 8, y: 2 },
        { x: 9, y: 2 },
      ],
    },
    {
      // Blue TU: tail U leads into the column.
      trainId: "blue",
      end: "tail",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
      ],
    },
  ],
  "level-04": [
    {
      // Blue SUN straight up its column.
      trainId: "blue",
      end: "head",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 2 },
      ],
    },
    {
      // Green TAR enters the row from the right corridor, heading left.
      trainId: "green",
      end: "head",
      targets: [
        { x: 9, y: 2 },
        { x: 8, y: 2 },
        { x: 7, y: 2 },
      ],
    },
  ],
  "level-05": [
    {
      // Blue NOO must cross M's cell before green parks there.
      trainId: "blue",
      end: "head",
      targets: [
        { x: 6, y: 2 },
        { x: 7, y: 2 },
        { x: 8, y: 2 },
        { x: 9, y: 2 },
      ],
    },
    {
      // Green MAT up the column afterwards.
      trainId: "green",
      end: "head",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 2 },
      ],
    },
  ],
  "tutorial-03": [
    {
      // Green DL through the column to the end of COLD.
      trainId: "green",
      end: "head",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 2 },
        { x: 7, y: 2 },
        { x: 8, y: 2 },
        { x: 9, y: 2 },
      ],
    },
    {
      // Blue CO: tail O leads through the column onto CO.
      trainId: "blue",
      end: "tail",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 2 },
        { x: 7, y: 2 },
      ],
    },
    {
      // Brown UT parks last in the column.
      trainId: "brown",
      end: "head",
      targets: [
        { x: 6, y: 4 },
        { x: 6, y: 3 },
      ],
    },
  ],
};

describe("bundled levels", () => {
  for (const level of levels) {
    it(`${level.id} passes schema validation`, () => {
      expect(validatePuzzle(level)).toEqual([]);
    });

    it(`${level.id} is solvable via its scripted walkthrough`, () => {
      let s: GameState = createState(level);
      for (const step of solutions[level.id]) {
        for (const target of step.targets) {
          const next = tryPull(s, step.trainId, step.end, target);
          expect(
            next,
            `${level.id}: pull ${step.trainId} ${step.end} -> ${target.x},${target.y}`,
          ).not.toBeNull();
          s = next!;
        }
      }
      expect(s.solved).toBe(true);
    });
  }

  it("tutorial-01: trains cannot wander off the track onto plain grid", () => {
    const s = createState(levels[0]);
    // Head D at (6,5): left/right neighbors are scenery, only (6,4) is track.
    expect(tryPull(s, "green", "head", { x: 5, y: 5 })).toBeNull();
    expect(tryPull(s, "green", "head", { x: 7, y: 5 })).toBeNull();
    expect(tryPull(s, "green", "head", { x: 6, y: 4 })).not.toBeNull();
  });

  it("every bundled level is solvable per the BFS solver", () => {
    for (const level of levels) {
      const r = solve(level, { maxNodes: 150_000 });
      expect(r.status, `${level.id}: ${r.status} after ${r.nodes} nodes`).toBe(
        "solvable",
      );
    }
  });

  it("level-05 teaches ordering: green parked first blocks blue's entry", () => {
    let s: GameState = createState(levels[4]);
    s = tryPull(s, "green", "head", { x: 6, y: 4 })!;
    s = tryPull(s, "green", "head", { x: 6, y: 3 })!;
    s = tryPull(s, "green", "head", { x: 6, y: 2 })!;
    // Blue can no longer cross M's cell.
    expect(tryPull(s, "blue", "head", { x: 6, y: 2 })).toBeNull();
  });

  it("tutorial-02 teaches ordering: blue parked first blocks the column", () => {
    let s: GameState = createState(levels[1]);
    // Park blue in the column immediately.
    s = tryPull(s, "blue", "tail", { x: 6, y: 4 })!;
    s = tryPull(s, "blue", "tail", { x: 6, y: 3 })!;
    // Green can no longer enter the column upward.
    expect(tryPull(s, "green", "head", { x: 6, y: 4 })).toBeNull();
  });

  it("level-06 (fixed blocks) passes schema validation", () => {
    expect(validatePuzzle(level06 as unknown as Puzzle)).toEqual([]);
  });

  it("level-06 solves via its scripted walkthrough, honoring the fixed E and S", () => {
    const p = level06 as unknown as Puzzle;
    let s: GameState = createState(p);
    for (const [id, end, x, y] of level06Walkthrough) {
      const next = tryPull(s, id, end, { x, y });
      expect(next, `level-06: pull ${id} ${end} -> ${x},${y}`).not.toBeNull();
      s = next!;
    }
    expect(s.solved).toBe(true);
  });

  it("level-06: the two fixed cells are pre-filled and immovable", () => {
    const p = level06 as unknown as Puzzle;
    const occ = occupancy(createState(p));
    expect(occ.get("11,12")?.isFixed).toBe(true);
    expect(occ.get("11,12")?.letter).toBe("E");
    expect(occ.get("9,15")?.isFixed).toBe(true);
    expect(occ.get("9,15")?.letter).toBe("S");
  });
});
