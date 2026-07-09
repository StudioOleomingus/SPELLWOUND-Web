/** Grid coordinate. Origin top-left, x right, y down. */
export interface Vec {
  x: number;
  y: number;
}

/** Which end of a train is being referenced or pulled. */
export type End = "head" | "tail";

/** A crossword slot: a grid cell that must hold a specific letter when solved. */
export interface PlayCell {
  x: number;
  y: number;
  /** Uppercase letter that belongs here in the solved crossword. */
  letter: string;
}

/**
 * A colored triangle mark printed in a grid cell, indicating where a given
 * train's head or tail must come to rest. The order of the `hints` array in
 * the Puzzle is the reveal order used by ADD / REMOVE.
 */
export interface HintMark {
  cell: Vec;
  trainId: string;
  end: End;
}

/** A letter-train definition: an ordered chain of letter blocks. */
export interface TrainDef {
  id: string;
  /** CSS color for the train's blocks. */
  color: string;
  /** Letters ordered head -> tail. */
  letters: string[];
  /** Starting cells ordered head -> tail; same length as `letters`. */
  start: Vec[];
}

export interface Clue {
  direction: "across" | "down";
  /** The play cells of this word, in reading order. */
  cells: Vec[];
  answer: string;
  text: string;
}

export interface Puzzle {
  id: string;
  title: string;
  author?: string;
  /** Display number, e.g. 0 renders as "00". */
  levelNumber: number;
  gridWidth: number;
  gridHeight: number;
  /** Cells trains may never enter. Optional; most puzzles have none. */
  blocked?: Vec[];
  /**
   * Immovable pre-filled letter blocks. Each sits on a crossword play cell and
   * permanently shows that cell's solution letter: it blocks train movement,
   * counts as an already-solved cell, and never moves. Rendered in gray.
   */
  fixedBlocks?: Vec[];
  /**
   * Extra navigable cells beyond the automatic track (play cells + every
   * train's starting footprint). Trains may only ever occupy track cells;
   * the rest of the grid is scenery. Use these for connector corridors.
   */
  trackCells?: Vec[];
  playCells: PlayCell[];
  trains: TrainDef[];
  /** All head/tail rest marks, in ADD reveal order. */
  hints: HintMark[];
  /** How many hints are visible when the level loads. */
  defaultVisibleHints: number;
  clues: Clue[];
  /** Tutorial callout text shown in the blue box; \n for line breaks. */
  tutorialText?: string;
}

/** Mutable-per-move snapshot of a train: occupied cells, head first. */
export interface TrainState {
  id: string;
  cells: Vec[];
}

export interface GameState {
  puzzle: Puzzle;
  trains: TrainState[];
  moves: number;
  /** How many entries of puzzle.hints are currently shown. */
  visibleHints: number;
  solved: boolean;
}

/** What occupies a cell right now. */
export interface Occupant {
  trainId: string;
  /** Block index within the train, 0 = head. */
  index: number;
  letter: string;
  color: string;
  isHead: boolean;
  isTail: boolean;
  /** True for an immovable pre-filled block (not part of any train). */
  isFixed?: boolean;
}
