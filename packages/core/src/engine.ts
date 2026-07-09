import type {
  End,
  GameState,
  Occupant,
  Puzzle,
  TrainState,
  Vec,
} from "./types";

export const key = (v: Vec): string => `${v.x},${v.y}`;

/** Synthetic train id used for immovable pre-filled blocks in occupancy maps. */
export const FIXED_TRAIN_ID = "__fixed__";
/** Fill color for immovable pre-filled blocks. */
export const FIXED_COLOR = "#4b5157";

export function createState(puzzle: Puzzle): GameState {
  return {
    puzzle,
    trains: puzzle.trains.map((t) => ({
      id: t.id,
      cells: t.start.map((c) => ({ ...c })),
    })),
    moves: 0,
    visibleHints: clampHints(puzzle, puzzle.defaultVisibleHints),
    solved: false,
  };
}

function clampHints(puzzle: Puzzle, n: number): number {
  return Math.max(0, Math.min(n, puzzle.hints.length));
}

/** Map of "x,y" -> occupant, over every block of every train. */
export function occupancy(state: GameState): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const ts of state.trains) {
    const def = state.puzzle.trains.find((t) => t.id === ts.id)!;
    ts.cells.forEach((c, i) => {
      map.set(key(c), {
        trainId: ts.id,
        index: i,
        letter: def.letters[i],
        color: def.color,
        isHead: i === 0,
        isTail: i === ts.cells.length - 1,
        isFixed: false,
      });
    });
  }
  // Immovable pre-filled blocks: permanent occupants carrying their play
  // cell's solution letter. They block movement and satisfy that cell.
  for (const fb of state.puzzle.fixedBlocks ?? []) {
    const pc = state.puzzle.playCells.find((p) => p.x === fb.x && p.y === fb.y);
    map.set(key(fb), {
      trainId: FIXED_TRAIN_ID,
      index: -1,
      letter: pc?.letter ?? "",
      color: FIXED_COLOR,
      isHead: false,
      isTail: false,
      isFixed: true,
    });
  }
  return map;
}

export function inBounds(puzzle: Puzzle, v: Vec): boolean {
  return v.x >= 0 && v.y >= 0 && v.x < puzzle.gridWidth && v.y < puzzle.gridHeight;
}

export function isBlocked(puzzle: Puzzle, v: Vec): boolean {
  return (puzzle.blocked ?? []).some((b) => b.x === v.x && b.y === v.y);
}

const trackCache = new WeakMap<Puzzle, Set<string>>();

/**
 * The movement track: the only cells trains may occupy. It is the union of
 * the crossword play cells, every train's starting footprint, and any extra
 * `trackCells` the puzzle declares. The rest of the grid is scenery.
 */
export function trackSet(puzzle: Puzzle): Set<string> {
  let set = trackCache.get(puzzle);
  if (!set) {
    set = new Set<string>();
    for (const pc of puzzle.playCells) set.add(key(pc));
    for (const t of puzzle.trains) for (const c of t.start) set.add(key(c));
    for (const c of puzzle.trackCells ?? []) set.add(key(c));
    trackCache.set(puzzle, set);
  }
  return set;
}

export function isOnTrack(puzzle: Puzzle, v: Vec): boolean {
  return trackSet(puzzle).has(key(v));
}

export function getTrain(state: GameState, trainId: string): TrainState | undefined {
  return state.trains.find((t) => t.id === trainId);
}

/** The grid cell of a train's head or tail. */
export function endCell(train: TrainState, end: End): Vec {
  return end === "head" ? train.cells[0] : train.cells[train.cells.length - 1];
}

/**
 * Pull-only movement check: `target` must be orthogonally adjacent to the
 * chosen end, inside the grid, on the movement track, not blocked, and empty
 * (no train block — including this train's own body — may occupy it).
 */
export function canPull(
  state: GameState,
  trainId: string,
  end: End,
  target: Vec,
): boolean {
  if (state.solved) return false;
  const train = getTrain(state, trainId);
  if (!train) return false;
  const from = endCell(train, end);
  const manhattan = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);
  if (manhattan !== 1) return false;
  if (!inBounds(state.puzzle, target)) return false;
  if (!isOnTrack(state.puzzle, target)) return false;
  if (isBlocked(state.puzzle, target)) return false;
  return !occupancy(state).has(key(target));
}

/**
 * The one tricky algorithm: snake-follow. The pulled end advances into
 * `target` and every other block shifts one step along the train's own body.
 * Returns the next immutable state, or null if the move is illegal.
 */
export function tryPull(
  state: GameState,
  trainId: string,
  end: End,
  target: Vec,
): GameState | null {
  if (!canPull(state, trainId, end, target)) return null;
  const trains = state.trains.map((t) => {
    if (t.id !== trainId) return t;
    const cells =
      end === "head"
        ? [{ ...target }, ...t.cells.slice(0, -1).map((c) => ({ ...c }))]
        : [...t.cells.slice(1).map((c) => ({ ...c })), { ...target }];
    return { id: t.id, cells };
  });
  const next: GameState = {
    ...state,
    trains,
    moves: state.moves + 1,
    solved: false,
  };
  next.solved = isSolved(next);
  return next;
}

/**
 * Win condition: every play cell is occupied and the occupying block's letter
 * equals the cell's solution letter — i.e. the crossword reads correctly.
 * (Hint triangles are guidance; a correct reading is a solve.)
 */
export function isSolved(state: GameState): boolean {
  const occ = occupancy(state);
  return state.puzzle.playCells.every(
    (pc) => occ.get(`${pc.x},${pc.y}`)?.letter === pc.letter,
  );
}

/**
 * Has this train's head/tail come to rest on its designated hint cell?
 * (Regardless of whether that hint is currently visible — the mark's
 * position is a fact of the puzzle; ADD/REMOVE only toggles display.)
 * The renderer uses this to "fit" the notch: the corner triangle fills in.
 */
export function isEndDocked(state: GameState, trainId: string, end: End): boolean {
  const mark = state.puzzle.hints.find(
    (h) => h.trainId === trainId && h.end === end,
  );
  if (!mark) return false;
  const train = getTrain(state, trainId);
  if (!train) return false;
  const c = endCell(train, end);
  return c.x === mark.cell.x && c.y === mark.cell.y;
}

/** ADD / REMOVE difficulty dial. Clamped to [0, hints.length]. */
export function setVisibleHints(state: GameState, n: number): GameState {
  return { ...state, visibleHints: clampHints(state.puzzle, n) };
}

export function addHint(state: GameState): GameState {
  return setVisibleHints(state, state.visibleHints + 1);
}

export function removeHint(state: GameState): GameState {
  return setVisibleHints(state, state.visibleHints - 1);
}

/** The hint marks currently shown, per the ADD/REMOVE dial. */
export function visibleHintMarks(state: GameState) {
  return state.puzzle.hints.slice(0, state.visibleHints);
}

/** Restore the starting layout. */
export function reset(state: GameState): GameState {
  return createState(state.puzzle);
}

/** Clues whose word contains the given cell (0, 1 or 2 of them). */
export function cluesAt(puzzle: Puzzle, cell: Vec) {
  return puzzle.clues.filter((cl) =>
    cl.cells.some((c) => c.x === cell.x && c.y === cell.y),
  );
}

/** Is this cell a crossword slot? */
export function playCellAt(puzzle: Puzzle, cell: Vec) {
  return puzzle.playCells.find((pc) => pc.x === cell.x && pc.y === cell.y);
}
