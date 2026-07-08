import "./style.css";
import {
  addHint,
  cluesAt,
  createState,
  decodePuzzle,
  removeHint,
  tryPull,
  validatePuzzle,
} from "@spellwound/core";
import type { End, GameState, Puzzle, Vec } from "@spellwound/core";
import { Renderer, attachPullInput } from "@spellwound/board";
import { levels } from "./levels";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("board");
const renderer = new Renderer(canvas);

const tutorialBox = $("tutorial-box");
const cluePopover = $("clue-popover");
const levelBadge = $<HTMLButtonElement>("level-badge");
const moveCounter = $("move-counter");
const nextBtn = $<HTMLButtonElement>("next-btn");
const skipBtn = $<HTMLButtonElement>("skip-btn");
const addBtn = $<HTMLButtonElement>("add-btn");
const removeBtn = $<HTMLButtonElement>("remove-btn");
const menuOverlay = $("menu-overlay");
const levelsOverlay = $("levels-overlay");
const helpOverlay = $("help-overlay");
const levelGrid = $("level-grid");

// ---------------------------------------------------------------------------
// Progress persistence

interface Progress {
  /** Highest level index the player may enter. */
  unlocked: number;
  /** Best (fewest) moves per completed level id. */
  best: Record<string, number>;
  /** Level index PLAY resumes at. */
  current: number;
}

const PROGRESS_KEY = "spellwound.progress";

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        unlocked: Math.min(p.unlocked ?? 0, levels.length - 1),
        best: p.best ?? {},
        current: Math.min(p.current ?? 0, levels.length - 1),
      };
    }
  } catch {
    /* corrupted -> fresh start */
  }
  return { unlocked: 0, best: {}, current: 0 };
}

const progress = loadProgress();

function saveProgress(): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

// ---------------------------------------------------------------------------
// Game state

type Mode = "campaign" | "shared";
let mode: Mode = "campaign";
let levelIndex = 0;
let state: GameState | null = null;
let recorded = false;
let helpReturn: "menu" | "game" = "menu";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Screens

type Screen = "menu" | "levels" | "help" | "game";

function setScreen(screen: Screen): void {
  menuOverlay.hidden = screen !== "menu";
  levelsOverlay.hidden = screen !== "levels";
  helpOverlay.hidden = screen !== "help";
  hideClue();
}

function rebuildLevelGrid(): void {
  levelGrid.innerHTML = "";
  levels.forEach((lvl, i) => {
    const best = progress.best[lvl.id];
    const done = best !== undefined;
    const locked = i > progress.unlocked;
    const btn = document.createElement("button");
    btn.className =
      "level-cell" + (done ? " done" : "") + (locked ? " locked" : "");
    btn.disabled = locked;
    btn.title = lvl.title;
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = pad(lvl.levelNumber);
    btn.append(num);
    if (done) {
      const b = document.createElement("span");
      b.className = "best";
      b.textContent = pad(best);
      btn.append(b);
    }
    btn.addEventListener("click", () => startLevel(i));
    levelGrid.append(btn);
  });
}

// ---------------------------------------------------------------------------
// Rendering & HUD

function render(): void {
  if (!state) return;
  renderer.draw(state, input.currentDrag());
  moveCounter.textContent = `MOVES ${pad(state.moves)}`;
  nextBtn.hidden = !state.solved;
  addBtn.disabled = state.visibleHints >= state.puzzle.hints.length;
  removeBtn.disabled = state.visibleHints <= 0;
  if (state.solved && !recorded) onSolved();
}

function onSolved(): void {
  recorded = true;
  if (mode !== "campaign" || !state) return;
  const id = state.puzzle.id;
  const prev = progress.best[id];
  if (prev === undefined || state.moves < prev) progress.best[id] = state.moves;
  progress.unlocked = Math.max(
    progress.unlocked,
    Math.min(levelIndex + 1, levels.length - 1),
  );
  saveProgress();
}

function startPuzzle(puzzle: Puzzle): void {
  state = createState(puzzle);
  recorded = false;
  hideClue();
  levelBadge.textContent = mode === "shared" ? "✦" : pad(puzzle.levelNumber);
  skipBtn.hidden = mode === "shared";
  tutorialBox.hidden = !puzzle.tutorialText;
  tutorialBox.textContent = puzzle.tutorialText ?? "";
  renderer.layout(state);
  render();
  setScreen("game");
}

function startLevel(i: number): void {
  mode = "campaign";
  levelIndex = Math.max(0, Math.min(i, levels.length - 1));
  progress.current = levelIndex;
  saveProgress();
  startPuzzle(levels[levelIndex]);
}

function advance(): void {
  if (mode === "shared") {
    setScreen("menu");
    return;
  }
  if (levelIndex + 1 < levels.length) {
    startLevel(levelIndex + 1);
  } else {
    rebuildLevelGrid();
    setScreen("levels");
  }
}

// ---------------------------------------------------------------------------
// Clue popover

interface ClueSelection {
  cell: Vec;
  index: number;
}
let clueSelection: ClueSelection | null = null;

function hideClue(): void {
  clueSelection = null;
  cluePopover.hidden = true;
}

function showClueAt(cell: Vec): void {
  if (!state) return;
  const clues = cluesAt(state.puzzle, cell);
  if (clues.length === 0) {
    hideClue();
    return;
  }
  if (
    clueSelection &&
    clueSelection.cell.x === cell.x &&
    clueSelection.cell.y === cell.y
  ) {
    clueSelection.index = (clueSelection.index + 1) % clues.length;
  } else {
    clues.sort((a) => (a.direction === "across" ? -1 : 1));
    clueSelection = { cell, index: 0 };
  }
  const clue = clues[clueSelection.index];
  cluePopover.innerHTML = "";
  const dir = document.createElement("span");
  dir.className = "dir";
  dir.textContent = `${clue.direction} · ${clue.answer.length} letters`;
  cluePopover.append(dir, document.createTextNode(clue.text));
  cluePopover.hidden = false;
  const c = renderer.cellCenter(cell);
  const rect = canvas.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(rect.left + c.x + renderer.cell * 0.6, window.innerWidth - 260),
  );
  const top = Math.max(8, rect.top + c.y - renderer.cell * 1.4);
  cluePopover.style.left = `${left}px`;
  cluePopover.style.top = `${top}px`;
}

// ---------------------------------------------------------------------------
// Pull input (shared gesture module)

function isEmptyPlayCell(cell: Vec): boolean {
  return state !== null && renderer.isEmptyPlayCell(state, cell);
}

const input = attachPullInput(canvas, renderer, {
  getState: () => state,
  setState: (s) => {
    state = s;
  },
  onChange: render,
  onCellTap: (cell) => {
    hideClue();
    if (isEmptyPlayCell(cell)) showClueAt(cell);
    render();
  },
  cursorFor: (cell) => (cell && isEmptyPlayCell(cell) ? "help" : null),
  enabled: () =>
    menuOverlay.hidden && levelsOverlay.hidden && helpOverlay.hidden,
});

// ---------------------------------------------------------------------------
// Buttons

addBtn.addEventListener("click", () => {
  if (!state) return;
  state = addHint(state);
  render();
});
removeBtn.addEventListener("click", () => {
  if (!state) return;
  state = removeHint(state);
  render();
});
$("reset-btn").addEventListener("click", () => {
  if (!state) return;
  state = createState(state.puzzle);
  recorded = false;
  nextBtn.hidden = true;
  hideClue();
  render();
});
skipBtn.addEventListener("click", () => {
  if (mode !== "campaign") return;
  progress.unlocked = Math.max(
    progress.unlocked,
    Math.min(levelIndex + 1, levels.length - 1),
  );
  saveProgress();
  advance();
});
nextBtn.addEventListener("click", advance);

levelBadge.addEventListener("click", () => {
  if (mode !== "campaign") return;
  rebuildLevelGrid();
  setScreen("levels");
});

$("menu-play").addEventListener("click", () => startLevel(progress.current));
$("menu-levels").addEventListener("click", () => {
  rebuildLevelGrid();
  setScreen("levels");
});
$("menu-how").addEventListener("click", () => {
  helpReturn = "menu";
  setScreen("help");
});
$("help-btn").addEventListener("click", () => {
  helpReturn = "game";
  setScreen("help");
});
$("help-close").addEventListener("click", () =>
  setScreen(helpReturn === "game" && state ? "game" : "menu"),
);
$("levels-close").addEventListener("click", () =>
  setScreen(state ? "game" : "menu"),
);

const relayout = (): void => {
  if (!state) return;
  renderer.layout(state);
  hideClue();
  render();
};
window.addEventListener("resize", relayout);
window.addEventListener("orientationchange", relayout);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Debug handle

declare global {
  interface Window {
    spellwound?: {
      getState: () => GameState | null;
      pull: (trainId: string, end: End, x: number, y: number) => boolean;
    };
  }
}
window.spellwound = {
  getState: () => state,
  pull: (trainId, end, x, y) => {
    if (!state) return false;
    const next = tryPull(state, trainId, end, { x, y });
    if (!next) return false;
    state = next;
    render();
    return true;
  },
};

// ---------------------------------------------------------------------------
// Boot: shared puzzle via #p=<code>, else main menu.

async function init(): Promise<void> {
  const m = location.hash.match(/^#p=(.+)$/);
  if (m) {
    try {
      const puzzle = await decodePuzzle(m[1]);
      const errors = validatePuzzle(puzzle);
      if (errors.length > 0) throw new Error(errors.join("; "));
      mode = "shared";
      startPuzzle(puzzle);
      return;
    } catch (err) {
      console.error("Shared puzzle failed to load:", err);
      mode = "campaign";
    }
  }
  setScreen("menu");
}

void init();
