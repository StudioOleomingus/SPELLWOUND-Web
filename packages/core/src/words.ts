import { key } from "./engine";
import type { PlayCell, Vec } from "./types";

export interface DetectedWord {
  direction: "across" | "down";
  cells: Vec[];
  answer: string;
}

/**
 * Crossword word detection: maximal horizontal / vertical runs of play cells
 * with length >= 2, in reading order. The editor uses this to build the clue
 * panel so authors never hand-enter answers or cell lists.
 */
export function detectWords(playCells: PlayCell[]): DetectedWord[] {
  const byKey = new Map(playCells.map((pc) => [key(pc), pc]));
  const words: DetectedWord[] = [];
  const sorted = [...playCells].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const pc of sorted) {
    // Across: starts here if there is no slot to the left and one to the right.
    if (
      !byKey.has(key({ x: pc.x - 1, y: pc.y })) &&
      byKey.has(key({ x: pc.x + 1, y: pc.y }))
    ) {
      const cells: Vec[] = [];
      for (let x = pc.x; byKey.has(`${x},${pc.y}`); x++) cells.push({ x, y: pc.y });
      words.push({
        direction: "across",
        cells,
        answer: cells.map((c) => byKey.get(key(c))!.letter).join(""),
      });
    }
    // Down: starts here if there is no slot above and one below.
    if (
      !byKey.has(key({ x: pc.x, y: pc.y - 1 })) &&
      byKey.has(key({ x: pc.x, y: pc.y + 1 }))
    ) {
      const cells: Vec[] = [];
      for (let y = pc.y; byKey.has(`${pc.x},${y}`); y++) cells.push({ x: pc.x, y });
      words.push({
        direction: "down",
        cells,
        answer: cells.map((c) => byKey.get(key(c))!.letter).join(""),
      });
    }
  }
  return words;
}
