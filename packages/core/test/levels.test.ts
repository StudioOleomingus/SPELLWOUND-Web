import { describe, expect, it } from "vitest";
import { createState, solve, tryPull, validatePuzzle } from "../src";
import type { End, GameState, Puzzle, Vec } from "../src";
import tutorial01 from "../../../levels/tutorial-01.json";
import tutorial02 from "../../../levels/tutorial-02.json";
import tutorial03 from "../../../levels/tutorial-03.json";
import level04 from "../../../levels/level-04.json";
import level05 from "../../../levels/level-05.json";

const levels = [tutorial01, tutorial02, tutorial03, level04, level05] as unknown as Puzzle[];

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
});
