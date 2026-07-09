import "./editor.css";
import {
  createState,
  detectWords,
  encodePuzzle,
  key,
  occupancy,
  solve,
  validatePuzzle,
} from "@spellwound/core";
import type { End, GameState, Puzzle, Vec } from "@spellwound/core";
import { Renderer, attachPullInput } from "@spellwound/board";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("board");
const ctx = canvas.getContext("2d")!;
const renderer = new Renderer(canvas);
const banner = $("stage-banner");
const toolHint = $("tool-hint");
const trainList = $("train-list");
const clueList = $("clue-list");
const validation = $("validation");
const solveResult = $("solve-result");
const ioArea = $<HTMLTextAreaElement>("io-area");
const playBtn = $<HTMLButtonElement>("play-btn");

const PALETTE = ["#8fc31f", "#29abe2", "#b09272", "#e58bb1", "#f5a623", "#7d6fd9"];
const DRAFT_KEY = "spellwound.editor";

type Tool = "slot" | "train" | "track" | "fixed" | "erase";

// ---------------------------------------------------------------------------
// Draft state

function blankDraft(): Puzzle {
  return {
    id: "my-puzzle",
    title: "Untitled",
    author: "",
    levelNumber: 0,
    gridWidth: 15,
    gridHeight: 9,
    trackCells: [],
    fixedBlocks: [],
    playCells: [],
    trains: [],
    hints: [],
    defaultVisibleHints: 2,
    clues: [],
  };
}

function loadDraft(): Puzzle {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as Puzzle;
  } catch {
    /* fresh */
  }
  return blankDraft();
}

let draft: Puzzle = loadDraft();
let viewState: GameState = makeViewState();
let tool: Tool = "slot";
let focused: Vec | null = null;
let armedHint: { trainId: string; end: End } | null = null;
let trainPath: Vec[] = [];
let painting = false;
let paintAdd = true;
let playState: GameState | null = null;

/** Editor display state: the draft with every hint triangle visible. */
function makeViewState(): GameState {
  const s = createState(draft);
  return { ...s, visibleHints: draft.hints.length };
}

const same = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
const adjacent = (a: Vec, b: Vec): boolean =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

const slotAt = (c: Vec) => draft.playCells.find((p) => p.x === c.x && p.y === c.y);
const corridorAt = (c: Vec) => (draft.trackCells ?? []).some((t) => same(t, c));
const fixedAt = (c: Vec) => (draft.fixedBlocks ?? []).some((f) => same(f, c));
const trainBlockAt = (c: Vec) =>
  draft.trains.find((t) => t.start.some((s) => same(s, c)));

// ---------------------------------------------------------------------------
// Mutations (each ends in sync())

function sync(): void {
  // Auto-clean: hints must reference existing trains and sit on slots.
  draft.hints = draft.hints.filter(
    (h) => draft.trains.some((t) => t.id === h.trainId) && slotAt(h.cell),
  );
  // Fixed blocks only make sense on a play cell; drop any left stranded.
  draft.fixedBlocks = (draft.fixedBlocks ?? []).filter((fb) => slotAt(fb));
  draft.defaultVisibleHints = Math.min(draft.defaultVisibleHints, draft.hints.length);
  // Rebuild clues from the grid, preserving typed texts by direction+start.
  const texts = new Map(
    draft.clues.map((c) => [`${c.direction}:${key(c.cells[0])}`, c.text]),
  );
  draft.clues = detectWords(draft.playCells).map((w) => ({
    ...w,
    text: texts.get(`${w.direction}:${key(w.cells[0])}`) ?? "",
  }));
  // New object identity so core's per-puzzle track cache invalidates.
  draft = { ...draft };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  viewState = makeViewState();
  renderer.layout(viewState);
  rebuildPanel();
  drawEditor();
}

function addSlot(c: Vec): void {
  draft.playCells.push({ x: c.x, y: c.y, letter: "?" as string });
}

function removeSlot(c: Vec): void {
  draft.playCells = draft.playCells.filter((p) => !same(p, c));
}

function toggleCorridor(c: Vec, add: boolean): boolean {
  const has = corridorAt(c);
  if (add && !has && !slotAt(c)) {
    (draft.trackCells ??= []).push({ ...c });
    return true;
  }
  if (!add && has) {
    draft.trackCells = draft.trackCells!.filter((t) => !same(t, c));
    return true;
  }
  return false;
}

function toggleFixed(c: Vec, add: boolean): boolean {
  const has = fixedAt(c);
  if (add && !has && slotAt(c)) {
    (draft.fixedBlocks ??= []).push({ ...c });
    return true;
  }
  if (!add && has) {
    draft.fixedBlocks = (draft.fixedBlocks ?? []).filter((f) => !same(f, c));
    return true;
  }
  return false;
}

function removeTrain(id: string): void {
  draft.trains = draft.trains.filter((t) => t.id !== id);
  draft.hints = draft.hints.filter((h) => h.trainId !== id);
}

function finalizeTrainPath(): void {
  if (trainPath.length === 0) return;
  const n = draft.trains.length;
  const letters = trainPath.map((c) => slotAt(c)?.letter ?? "?");
  let i = 1;
  while (draft.trains.some((t) => t.id === `train-${i}`)) i++;
  draft.trains.push({
    id: `train-${i}`,
    color: PALETTE[n % PALETTE.length],
    letters,
    start: trainPath.map((c) => ({ ...c })),
  });
  trainPath = [];
  sync();
}

function setHint(trainId: string, end: End, cell: Vec): void {
  draft.hints = draft.hints.filter((h) => !(h.trainId === trainId && h.end === end));
  draft.hints.push({ cell: { ...cell }, trainId, end });
}

function eraseAt(c: Vec): void {
  const hadHints = draft.hints.some((h) => same(h.cell, c));
  if (hadHints) {
    draft.hints = draft.hints.filter((h) => !same(h.cell, c));
    return;
  }
  if (fixedAt(c)) {
    toggleFixed(c, false);
    return;
  }
  const train = trainBlockAt(c);
  if (train) {
    removeTrain(train.id);
    return;
  }
  if (slotAt(c)) {
    removeSlot(c);
    return;
  }
  if (corridorAt(c)) toggleCorridor(c, false);
}

// ---------------------------------------------------------------------------
// Drawing

function drawEditor(): void {
  if (playState) return; // play mode draws via its own onChange
  renderer.draw(viewState, null);
  const cell = renderer.cell;
  const occ = occupancy(viewState);

  // Solution letters in empty slots ("?" in red = still to type).
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(cell * 0.42)}px "Segoe UI", system-ui, sans-serif`;
  for (const pc of draft.playCells) {
    if (occ.has(key(pc))) continue;
    const c = renderer.cellCenter(pc);
    ctx.fillStyle = pc.letter === "?" ? "#e0442f" : "rgba(90, 125, 205, 0.75)";
    ctx.fillText(pc.letter, c.x, c.y + cell * 0.02);
  }

  // Focused slot outline.
  if (focused && slotAt(focused)) {
    const x = renderer.origin.x + focused.x * cell;
    const y = renderer.origin.y + focused.y * cell;
    ctx.strokeStyle = "#29abe2";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
  }

  // Pending train path.
  if (trainPath.length > 0) {
    const color = PALETTE[draft.trains.length % PALETTE.length];
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = color;
    for (const c of trainPath) {
      ctx.fillRect(
        renderer.origin.x + c.x * cell + 1,
        renderer.origin.y + c.y * cell + 1,
        cell - 2,
        cell - 2,
      );
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    trainPath.forEach((c, i) => {
      const p = renderer.cellCenter(c);
      ctx.fillText(String(i + 1), p.x, p.y);
    });
  }
}

function setBanner(text: string | null): void {
  banner.hidden = !text;
  banner.textContent = text ?? "";
}

// ---------------------------------------------------------------------------
// Panel

const TOOL_HINTS: Record<Tool, string> = {
  slot: "Click or drag on the grid to paint crossword slots. Click a slot and type its letter; arrow keys move, backspace clears.",
  train: "Drag a path to lay a train, head first. Letters auto-fill from slots beneath (edit them in the list below).",
  track: "Paint extra corridor cells that trains may travel through. Slots and train starts are track automatically.",
  fixed: "Click a crossword slot to lock it as an immovable gray block: pre-filled with its letter, blocks trains, counts as solved. Click again to unlock.",
  erase: "Click a cell to erase: hint marks first, then fixed blocks, then trains, then slots, then corridors.",
};

function rebuildPanel(): void {
  // meta
  $<HTMLInputElement>("meta-id").value = draft.id;
  $<HTMLInputElement>("meta-title").value = draft.title;
  $<HTMLInputElement>("meta-number").value = String(draft.levelNumber);
  $<HTMLInputElement>("meta-hints").value = String(draft.defaultVisibleHints);
  $<HTMLInputElement>("meta-hints").max = String(draft.hints.length);
  $<HTMLInputElement>("meta-w").value = String(draft.gridWidth);
  $<HTMLInputElement>("meta-h").value = String(draft.gridHeight);
  toolHint.textContent = armedHint
    ? "Click a crossword slot to place the mark."
    : TOOL_HINTS[tool];

  // trains
  trainList.innerHTML = "";
  if (draft.trains.length === 0) {
    trainList.innerHTML = '<p class="small">No trains yet — use the TRAIN tool.</p>';
  }
  for (const t of draft.trains) {
    const row = document.createElement("div");
    row.className = "train-row";

    const sw = document.createElement("button");
    sw.className = "swatch";
    sw.style.background = t.color;
    sw.title = "Cycle color";
    sw.addEventListener("click", () => {
      const i = PALETTE.indexOf(t.color);
      t.color = PALETTE[(i + 1) % PALETTE.length];
      sync();
    });

    const letters = document.createElement("input");
    letters.className = "letters";
    letters.value = t.letters.join("");
    letters.maxLength = t.letters.length;
    letters.title = `${t.letters.length} letters, head first`;
    letters.addEventListener("change", () => {
      const clean = letters.value.toUpperCase().replace(/[^A-Z?]/g, "");
      t.letters = Array.from(
        { length: t.start.length },
        (_, i) => clean[i] ?? "?",
      );
      sync();
    });

    const mk = (end: End): HTMLButtonElement => {
      const b = document.createElement("button");
      const has = draft.hints.some((h) => h.trainId === t.id && h.end === end);
      b.className =
        "mini" +
        (armedHint?.trainId === t.id && armedHint.end === end ? " armed" : "") +
        (has ? " set" : "");
      b.textContent = end === "head" ? "HEAD ◤" : "TAIL ◢";
      b.title = `Place the ${end} mark on a slot`;
      b.addEventListener("click", () => {
        armedHint =
          armedHint?.trainId === t.id && armedHint.end === end
            ? null
            : { trainId: t.id, end };
        rebuildPanel();
      });
      return b;
    };

    const del = document.createElement("button");
    del.className = "mini";
    del.textContent = "✕";
    del.title = "Delete train";
    del.addEventListener("click", () => {
      removeTrain(t.id);
      sync();
    });

    row.append(sw, letters, mk("head"), mk("tail"), del);
    trainList.append(row);
  }

  // clues
  clueList.innerHTML = "";
  if (draft.clues.length === 0) {
    clueList.innerHTML =
      '<p class="small">Words appear here automatically once slots form runs of 2+.</p>';
  }
  for (const cl of draft.clues) {
    const row = document.createElement("div");
    row.className = "clue-row";
    const word = document.createElement("span");
    word.className = "word";
    word.innerHTML = `<span class="dir">${cl.direction.toUpperCase()}</span> ${cl.answer}`;
    const input = document.createElement("input");
    input.placeholder = "Clue text…";
    input.value = cl.text;
    input.addEventListener("change", () => {
      cl.text = input.value;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    });
    row.append(word, input);
    clueList.append(row);
  }

  // validation
  const errors = validatePuzzle(draft);
  validation.innerHTML = "";
  if (errors.length === 0) {
    validation.innerHTML = '<span class="ok">VALID ✓</span>';
  } else {
    for (const e of errors.slice(0, 12)) {
      const s = document.createElement("span");
      s.className = "err";
      s.textContent = e;
      validation.append(s);
    }
    if (errors.length > 12) {
      const s = document.createElement("span");
      s.className = "err";
      s.textContent = `…and ${errors.length - 12} more`;
      validation.append(s);
    }
  }
  playBtn.disabled = errors.length > 0 && !playState;
}

// ---------------------------------------------------------------------------
// Canvas editing input

function cellFromEvent(e: PointerEvent): Vec | null {
  const rect = canvas.getBoundingClientRect();
  return renderer.cellAt(e.clientX - rect.left, e.clientY - rect.top, viewState);
}

canvas.addEventListener("pointerdown", (e) => {
  if (playState) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  canvas.setPointerCapture(e.pointerId);
  if (armedHint) {
    if (slotAt(cell)) {
      setHint(armedHint.trainId, armedHint.end, cell);
      armedHint = null;
      sync();
    }
    return;
  }
  switch (tool) {
    case "slot":
      if (slotAt(cell)) {
        focused = cell;
        drawEditor();
      } else if (!trainBlockAt(cell)) {
        addSlot(cell);
        focused = cell;
        painting = true;
        sync();
      }
      break;
    case "track":
      paintAdd = !corridorAt(cell);
      if (toggleCorridor(cell, paintAdd)) sync();
      painting = true;
      break;
    case "fixed":
      if (slotAt(cell)) {
        paintAdd = !fixedAt(cell);
        if (toggleFixed(cell, paintAdd)) sync();
        painting = true;
      }
      break;
    case "train":
      if (!trainBlockAt(cell)) {
        trainPath = [cell];
        drawEditor();
      }
      break;
    case "erase":
      eraseAt(cell);
      focused = null;
      sync();
      break;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (playState) return;
  if (e.buttons === 0) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  if (tool === "slot" && painting && !slotAt(cell) && !trainBlockAt(cell)) {
    addSlot(cell);
    focused = cell;
    sync();
  } else if (tool === "track" && painting) {
    if (toggleCorridor(cell, paintAdd)) sync();
  } else if (tool === "fixed" && painting && slotAt(cell)) {
    if (toggleFixed(cell, paintAdd)) sync();
  } else if (tool === "train" && trainPath.length > 0) {
    const last = trainPath[trainPath.length - 1];
    if (
      !same(last, cell) &&
      adjacent(last, cell) &&
      !trainPath.some((c) => same(c, cell)) &&
      !trainBlockAt(cell)
    ) {
      trainPath.push(cell);
      drawEditor();
    }
  }
});

const endStroke = (): void => {
  painting = false;
  if (tool === "train") finalizeTrainPath();
};
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

document.addEventListener("keydown", (e) => {
  if (playState) return;
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
  if (e.key === "Escape") {
    focused = null;
    armedHint = null;
    trainPath = [];
    rebuildPanel();
    drawEditor();
    return;
  }
  if (!focused) return;
  const slot = slotAt(focused);
  if (!slot) return;
  if (/^[a-zA-Z]$/.test(e.key)) {
    slot.letter = e.key.toUpperCase();
    const next = { x: focused.x + 1, y: focused.y };
    if (slotAt(next)) focused = next;
    sync();
  } else if (e.key === "Backspace" || e.key === "Delete") {
    slot.letter = "?";
    sync();
  } else if (e.key.startsWith("Arrow")) {
    const d: Record<string, Vec> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const next = {
      x: focused.x + d[e.key].x,
      y: focused.y + d[e.key].y,
    };
    if (slotAt(next)) {
      focused = next;
      drawEditor();
    }
    e.preventDefault();
  }
});

// ---------------------------------------------------------------------------
// Test play (real engine + shared pull gesture)

const playInput = attachPullInput(canvas, renderer, {
  getState: () => playState,
  setState: (s) => {
    playState = s;
  },
  onChange: () => {
    if (!playState) return;
    renderer.draw(playState, playInput.currentDrag());
    setBanner(
      playState.solved
        ? `SOLVED IN ${playState.moves} MOVES — press STOP to keep editing`
        : `TEST PLAY — ${playState.moves} moves`,
    );
  },
  enabled: () => playState !== null,
});

playBtn.addEventListener("click", () => {
  if (playState) {
    playState = null;
    playBtn.textContent = "TEST PLAY";
    setBanner(null);
    sync();
    return;
  }
  if (validatePuzzle(draft).length > 0) return;
  playState = createState(draft);
  playBtn.textContent = "STOP";
  renderer.layout(playState);
  renderer.draw(playState, null);
  setBanner("TEST PLAY — drag heads and tails");
});

// ---------------------------------------------------------------------------
// Tools & actions

for (const btn of document.querySelectorAll<HTMLButtonElement>("#tools .tool")) {
  btn.addEventListener("click", () => {
    tool = btn.dataset.tool as Tool;
    armedHint = null;
    trainPath = [];
    document
      .querySelectorAll("#tools .tool")
      .forEach((b) => b.classList.toggle("active", b === btn));
    rebuildPanel();
    drawEditor();
  });
}

function bindMeta(
  id: string,
  apply: (value: string) => void,
): void {
  $<HTMLInputElement>(id).addEventListener("change", (e) => {
    apply((e.target as HTMLInputElement).value);
    sync();
  });
}
bindMeta("meta-id", (v) => (draft.id = v.trim() || "my-puzzle"));
bindMeta("meta-title", (v) => (draft.title = v.trim() || "Untitled"));
bindMeta("meta-number", (v) => (draft.levelNumber = Math.max(0, Number(v) || 0)));
bindMeta("meta-hints", (v) => {
  draft.defaultVisibleHints = Math.max(0, Math.min(Number(v) || 0, draft.hints.length));
});
bindMeta("meta-w", (v) => {
  draft.gridWidth = Math.max(5, Math.min(30, Number(v) || 15));
});
bindMeta("meta-h", (v) => {
  draft.gridHeight = Math.max(5, Math.min(30, Number(v) || 9));
});

$("solve-btn").addEventListener("click", () => {
  const errors = validatePuzzle(draft);
  if (errors.length > 0) {
    solveResult.textContent = "Fix validation errors first.";
    return;
  }
  solveResult.textContent = "Searching…";
  setTimeout(() => {
    const r = solve(draft, { maxNodes: 250_000 });
    solveResult.textContent =
      r.status === "solvable"
        ? `Solvable — optimal ${r.moves} moves (${r.nodes} states).`
        : r.status === "unsolvable"
          ? `UNSOLVABLE — no solution exists (${r.nodes} states searched).`
          : `Undecided — search budget hit (${r.nodes} states). Simplify?`;
  }, 20);
});

$("export-btn").addEventListener("click", () => {
  const json = JSON.stringify(draft, null, 2);
  ioArea.value = json;
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${draft.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("share-btn").addEventListener("click", () => {
  void (async () => {
    const errors = validatePuzzle(draft);
    if (errors.length > 0) {
      ioArea.value = `Fix validation errors before sharing:\n${errors.join("\n")}`;
      return;
    }
    const code = await encodePuzzle(draft);
    const playerUrl = new URL("../../player/dist/index.html", location.href).href;
    ioArea.value = `${playerUrl}#p=${code}`;
    try {
      await navigator.clipboard.writeText(ioArea.value);
    } catch {
      /* user can copy manually */
    }
  })();
});

$("import-btn").addEventListener("click", () => {
  try {
    const parsed = JSON.parse(ioArea.value) as Puzzle;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.playCells)) {
      throw new Error("not a puzzle");
    }
    draft = { ...blankDraft(), ...parsed };
    focused = null;
    armedHint = null;
    sync();
  } catch {
    ioArea.value = "Could not parse that as puzzle JSON.";
  }
});

$("copy-btn").addEventListener("click", () => {
  ioArea.select();
  void navigator.clipboard.writeText(ioArea.value).catch(() => {});
});

$("new-btn").addEventListener("click", () => {
  if (!confirm("Start a new blank puzzle? The current draft will be replaced.")) return;
  draft = blankDraft();
  focused = null;
  armedHint = null;
  trainPath = [];
  sync();
});

window.addEventListener("resize", () => {
  renderer.layout(playState ?? viewState);
  if (playState) {
    renderer.draw(playState, playInput.currentDrag());
  } else {
    drawEditor();
  }
});

// ---------------------------------------------------------------------------
sync();
