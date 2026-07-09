import { key } from "./engine";
import type { Puzzle, Vec } from "./types";

const adjacent = (a: Vec, b: Vec) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/**
 * Structural validation of a Puzzle. Returns a list of human-readable errors;
 * empty list means the puzzle is well-formed. Both the player and the editor
 * run this at load time so bad puzzles are rejected early.
 */
export function validatePuzzle(p: Puzzle): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  if (!p.id) err("puzzle.id is required");
  if (!Number.isInteger(p.gridWidth) || p.gridWidth < 1) err("gridWidth must be a positive integer");
  if (!Number.isInteger(p.gridHeight) || p.gridHeight < 1) err("gridHeight must be a positive integer");

  const inBounds = (v: Vec) =>
    v.x >= 0 && v.y >= 0 && v.x < p.gridWidth && v.y < p.gridHeight;
  const blockedSet = new Set((p.blocked ?? []).map(key));

  // Play cells: unique, in bounds, single uppercase letters.
  const playByKey = new Map<string, string>();
  for (const pc of p.playCells) {
    const k = key(pc);
    if (!inBounds(pc)) err(`playCell ${k} out of bounds`);
    if (blockedSet.has(k)) err(`playCell ${k} is also a blocked cell`);
    if (playByKey.has(k)) err(`duplicate playCell at ${k}`);
    if (!/^[A-Z]$/.test(pc.letter)) err(`playCell ${k} letter must be a single A-Z character`);
    playByKey.set(k, pc.letter);
  }

  // Extra track cells: in bounds.
  for (const c of p.trackCells ?? []) {
    if (!inBounds(c)) err(`trackCell ${key(c)} out of bounds`);
  }

  // Fixed (immovable pre-filled) blocks: in bounds, unique, sit on a play
  // cell (so they carry a solution letter), and not on a blocked cell.
  const fixedSet = new Set<string>();
  for (const fb of p.fixedBlocks ?? []) {
    const k = key(fb);
    if (!inBounds(fb)) err(`fixedBlock ${k} out of bounds`);
    if (blockedSet.has(k)) err(`fixedBlock ${k} is also a blocked cell`);
    if (fixedSet.has(k)) err(`duplicate fixedBlock at ${k}`);
    if (!playByKey.has(k)) err(`fixedBlock ${k} is not on a play cell`);
    fixedSet.add(k);
  }

  // Trains: shape, bounds, connectivity, no overlaps.
  const occupied = new Set<string>();
  const trainIds = new Set<string>();
  for (const t of p.trains) {
    if (trainIds.has(t.id)) err(`duplicate train id "${t.id}"`);
    trainIds.add(t.id);
    if (t.letters.length === 0) err(`train "${t.id}" has no letters`);
    if (t.letters.length !== t.start.length)
      err(`train "${t.id}": letters (${t.letters.length}) and start (${t.start.length}) lengths differ`);
    for (const l of t.letters)
      if (!/^[A-Z]$/.test(l)) err(`train "${t.id}" letter "${l}" must be a single A-Z character`);
    t.start.forEach((c, i) => {
      const k = key(c);
      if (!inBounds(c)) err(`train "${t.id}" start cell ${k} out of bounds`);
      if (blockedSet.has(k)) err(`train "${t.id}" start cell ${k} is blocked`);
      if (fixedSet.has(k)) err(`train "${t.id}" start cell ${k} sits on an immovable block`);
      if (occupied.has(k)) err(`train "${t.id}" start cell ${k} overlaps another block`);
      occupied.add(k);
      if (i > 0 && !adjacent(c, t.start[i - 1]))
        err(`train "${t.id}" start cells ${key(t.start[i - 1])} and ${k} are not adjacent`);
    });
  }

  // Hints: reference real trains, sit on play cells, and the letter matches.
  for (const h of p.hints) {
    const t = p.trains.find((tr) => tr.id === h.trainId);
    const k = key(h.cell);
    if (!t) {
      err(`hint at ${k} references unknown train "${h.trainId}"`);
      continue;
    }
    if (h.end !== "head" && h.end !== "tail") err(`hint at ${k} has invalid end "${h.end}"`);
    if (fixedSet.has(k)) err(`hint at ${k} sits on an immovable block a train end can never reach`);
    const slot = playByKey.get(k);
    if (slot === undefined) err(`hint at ${k} is not on a play cell`);
    else {
      const endLetter = h.end === "head" ? t.letters[0] : t.letters[t.letters.length - 1];
      if (slot !== endLetter)
        err(`hint at ${k}: cell wants "${slot}" but train "${t.id}" ${h.end} is "${endLetter}"`);
    }
  }
  if (p.defaultVisibleHints < 0 || p.defaultVisibleHints > p.hints.length)
    err(`defaultVisibleHints ${p.defaultVisibleHints} outside [0, ${p.hints.length}]`);

  // Clues: contiguous, on play cells, answer matches the solution letters.
  for (const cl of p.clues) {
    const label = `${cl.direction} clue "${cl.answer}"`;
    if (cl.cells.length !== cl.answer.length)
      err(`${label}: ${cl.cells.length} cells but ${cl.answer.length} letters`);
    cl.cells.forEach((c, i) => {
      const k = key(c);
      const slot = playByKey.get(k);
      if (slot === undefined) err(`${label}: cell ${k} is not a play cell`);
      else if (slot !== cl.answer[i])
        err(`${label}: cell ${k} holds "${slot}" but answer expects "${cl.answer[i]}"`);
      if (i > 0) {
        const prev = cl.cells[i - 1];
        const ok =
          cl.direction === "across"
            ? c.y === prev.y && c.x === prev.x + 1
            : c.x === prev.x && c.y === prev.y + 1;
        if (!ok) err(`${label}: cells not contiguous in reading order at ${k}`);
      }
    });
  }

  // Solvability sanity: fixed blocks pre-fill their own play cells, so the
  // trains must cover exactly the remaining (movable) play cells.
  const totalBlocks = p.trains.reduce((n, t) => n + t.letters.length, 0);
  const movableCells = p.playCells.length - fixedSet.size;
  if (totalBlocks !== movableCells)
    err(`train blocks (${totalBlocks}) != movable play cells (${movableCells} = ${p.playCells.length} slots - ${fixedSet.size} fixed); puzzle cannot be exactly filled`);

  return errors;
}
