import { createState, endCell, tryPull } from "./engine";
import type { End, GameState, Puzzle } from "./types";

export interface SolveResult {
  /**
   * "solvable"   — a solution was found (moves = shortest pull count).
   * "unsolvable" — the full reachable state space contains no solved state.
   * "exhausted"  — hit the node budget before deciding; treat as unknown.
   */
  status: "solvable" | "unsolvable" | "exhausted";
  moves?: number;
  nodes: number;
}

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const stateKey = (s: GameState): string =>
  s.trains.map((t) => t.cells.map((c) => `${c.x},${c.y}`).join(";")).join("|");

/**
 * Breadth-first solvability check over the pull-move graph, so the editor can
 * refuse to publish impossible puzzles. BFS depth = optimal move count.
 * Bounded by `maxNodes` because the state space is exponential in theory
 * (in practice real puzzles are tiny).
 */
export function solve(
  puzzle: Puzzle,
  opts: { maxNodes?: number } = {},
): SolveResult {
  const maxNodes = opts.maxNodes ?? 150_000;
  const start = createState(puzzle);
  if (start.solved) return { status: "solvable", moves: 0, nodes: 1 };
  const seen = new Set<string>([stateKey(start)]);
  let frontier: GameState[] = [start];
  let depth = 0;
  let nodes = 1;

  while (frontier.length > 0 && nodes < maxNodes) {
    depth++;
    const next: GameState[] = [];
    for (const s of frontier) {
      for (const t of s.trains) {
        const ends: End[] = t.cells.length === 1 ? ["head"] : ["head", "tail"];
        for (const end of ends) {
          const from = endCell(t, end);
          for (const d of DIRS) {
            const ns = tryPull(s, t.id, end, { x: from.x + d.x, y: from.y + d.y });
            if (!ns) continue;
            const k = stateKey(ns);
            if (seen.has(k)) continue;
            seen.add(k);
            nodes++;
            if (ns.solved) return { status: "solvable", moves: depth, nodes };
            if (nodes >= maxNodes) return { status: "exhausted", nodes };
            next.push(ns);
          }
        }
      }
    }
    frontier = next;
  }
  return frontier.length === 0
    ? { status: "unsolvable", nodes }
    : { status: "exhausted", nodes };
}
