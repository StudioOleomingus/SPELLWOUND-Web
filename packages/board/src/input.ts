import { endCell, key, occupancy, tryPull } from "@spellwound/core";
import type { End, GameState, Vec } from "@spellwound/core";
import { Renderer } from "./renderer";

export interface PullInputOptions {
  getState(): GameState | null;
  setState(state: GameState): void;
  /** Called after every successful pull (and on drag start/end) to re-render. */
  onChange(): void;
  /** Tap on a cell where no drag started and no pull happened (e.g. clues). */
  onCellTap?(cell: Vec): void;
  /** Extra cursor for non-draggable cells ("help" over clue cells, etc.). */
  cursorFor?(cell: Vec | null): string | null;
  /** Gate: return false to ignore input (menus open, editor mode, ...). */
  enabled?(): boolean;
}

interface DragRef {
  trainId: string;
  end: End;
  pointerId: number;
  moved: boolean;
}

/**
 * The pull gesture, shared by the player and the editor's test-play mode:
 * grab a head/tail (with a finger-sized tolerance), drag across cell
 * boundaries, and the train snakes after the pointer — pull-only, enforced
 * by the core rules. Returns a detach function and a probe for the current
 * drag (for rendering the grabbed-end highlight).
 */
export function attachPullInput(
  canvas: HTMLCanvasElement,
  renderer: Renderer,
  opts: PullInputOptions,
): { detach(): void; currentDrag(): { trainId: string; end: End } | null } {
  let drag: DragRef | null = null;

  const point = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Head/tail under the pointer, with tolerance for fat fingers. */
  const grabEndAt = (p: { x: number; y: number }): DragRef | null => {
    const state = opts.getState();
    if (!state || state.solved) return null;
    const cell = renderer.cellAt(p.x, p.y, state);
    if (cell) {
      const occ = occupancy(state).get(key(cell));
      if (occ && (occ.isHead || occ.isTail)) {
        return {
          trainId: occ.trainId,
          end: occ.isHead ? "head" : "tail",
          pointerId: -1,
          moved: false,
        };
      }
    }
    let bestDist = renderer.cell * 0.85;
    let found: DragRef | null = null;
    for (const ts of state.trains) {
      const ends: End[] = ts.cells.length === 1 ? ["head"] : ["head", "tail"];
      for (const end of ends) {
        const c = renderer.cellCenter(endCell(ts, end));
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          found = { trainId: ts.id, end, pointerId: -1, moved: false };
        }
      }
    }
    return found;
  };

  /** Greedily step the grabbed end toward the pointer cell (axis-major). */
  const stepToward = (target: Vec): void => {
    if (!drag) return;
    for (let guard = 0; guard < 12; guard++) {
      const state = opts.getState();
      if (!state) return;
      const train = state.trains.find((t) => t.id === drag!.trainId)!;
      const from = endCell(train, drag.end);
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      if (dx === 0 && dy === 0) break;
      const stepX = { x: from.x + Math.sign(dx), y: from.y };
      const stepY = { x: from.x, y: from.y + Math.sign(dy) };
      const tryOrder =
        Math.abs(dx) >= Math.abs(dy) ? [stepX, stepY] : [stepY, stepX];
      let advanced = false;
      for (const step of tryOrder) {
        if (step.x === from.x && step.y === from.y) continue;
        const next = tryPull(state, drag.trainId, drag.end, step);
        if (next) {
          opts.setState(next);
          drag.moved = true;
          advanced = true;
          break;
        }
      }
      if (!advanced) break; // visually resist illegal moves
    }
  };

  const onDown = (e: PointerEvent): void => {
    if (opts.enabled && !opts.enabled()) return;
    const state = opts.getState();
    if (!state) return;
    const p = point(e);
    const g = grabEndAt(p);
    if (g) {
      drag = { ...g, pointerId: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      opts.onChange();
    } else {
      const cell = renderer.cellAt(p.x, p.y, state);
      if (cell) opts.onCellTap?.(cell);
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (opts.enabled && !opts.enabled()) return;
    const state = opts.getState();
    if (!state) return;
    const p = point(e);
    if (drag && e.pointerId === drag.pointerId) {
      const cell = renderer.cellAt(p.x, p.y, state);
      if (cell) {
        const before = opts.getState();
        stepToward(cell);
        if (opts.getState() !== before) opts.onChange();
      }
      return;
    }
    const cell = renderer.cellAt(p.x, p.y, state);
    const grabbable = !state.solved && cell !== null && grabEndAt(p) !== null;
    canvas.style.cursor = grabbable
      ? "grab"
      : (opts.cursorFor?.(cell) ?? "default");
  };

  const onUp = (e: PointerEvent): void => {
    if (drag && e.pointerId === drag.pointerId) {
      drag = null;
      opts.onChange();
    }
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return {
    detach() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      drag = null;
    },
    currentDrag: () =>
      drag ? { trainId: drag.trainId, end: drag.end } : null,
  };
}
