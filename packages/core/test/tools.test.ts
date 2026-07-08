import { describe, expect, it } from "vitest";
import { decodePuzzle, detectWords, encodePuzzle, solve } from "../src";
import type { Puzzle } from "../src";
import tutorial01 from "../../../levels/tutorial-01.json";
import tutorial03 from "../../../levels/tutorial-03.json";

const t01 = tutorial01 as unknown as Puzzle;
const t03 = tutorial03 as unknown as Puzzle;

describe("share codec", () => {
  it("round-trips a puzzle through encode/decode", async () => {
    const code = await encodePuzzle(t03);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe, no padding
    const back = await decodePuzzle(code);
    expect(back).toEqual(t03);
  });

  it("produces hash-fragment-sized codes for real levels", async () => {
    const code = await encodePuzzle(t01);
    expect(code.length).toBeLessThan(2000);
  });

  it("rejects garbage input", async () => {
    await expect(decodePuzzle("not-a-real-code")).rejects.toThrow();
  });
});

describe("detectWords", () => {
  it("finds COLD across and CUT down in the tutorial grid", () => {
    const words = detectWords(t01.playCells);
    expect(words).toHaveLength(2);
    const across = words.find((w) => w.direction === "across")!;
    const down = words.find((w) => w.direction === "down")!;
    expect(across.answer).toBe("COLD");
    expect(across.cells[0]).toEqual({ x: 6, y: 2 });
    expect(down.answer).toBe("CUT");
    expect(down.cells).toHaveLength(3);
  });

  it("ignores isolated single cells", () => {
    expect(
      detectWords([
        { x: 0, y: 0, letter: "A" },
        { x: 5, y: 5, letter: "B" },
      ]),
    ).toEqual([]);
  });
});

describe("solver", () => {
  it("proves every bundled tutorial solvable and reports optimal moves", () => {
    const r1 = solve(t01);
    expect(r1.status).toBe("solvable");
    expect(r1.moves).toBe(6); // the scripted walkthrough is optimal
    const r3 = solve(t03);
    expect(r3.status).toBe("solvable");
  });

  it("detects an unsolvable puzzle (sealed column)", () => {
    const sealed: Puzzle = { ...t01, blocked: [{ x: 6, y: 4 }] };
    const r = solve(sealed);
    expect(r.status).toBe("unsolvable");
  });
});
