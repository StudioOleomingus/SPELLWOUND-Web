import { endCell, key, occupancy, tryPull } from "@spellwound/core";
import type { End, GameState, Vec } from "@spellwound/core";
import { Renderer } from "./renderer";
// (pull gesture + pinch/pan view gestures)

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

  // --- multi-pointer view gestures (pinch-zoom / drag-pan) -------------------
  // Live pointers on the canvas, so we can tell a one-finger pull/tap from a
  // two-finger pinch and hand the leftover finger back to panning cleanly.
  const pointers = new Map<number, { x: number; y: number }>();
  /** One-finger pan/tap candidate (only pans once zoomed in). */
  let pan:
    | { pointerId: number; last: Vec; moved: boolean; tapCell: Vec | null }
    | null = null;
  /** Two-finger pinch state, tracking the previous gap and midpoint. */
  let pinch: { lastDist: number; lastMid: Vec } | null = null;
  const TAP_SLOP = 6; // px of movement before a touch stops being a tap

  const twoPointerGeom = (): { dist: number; mid: Vec } | null => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onDown = (e: PointerEvent): void => {
    if (opts.enabled && !opts.enabled()) return;
    const state = opts.getState();
    if (!state) return;
    const p = point(e);
    pointers.set(e.pointerId, p);

    // A second finger promotes any active gesture to a pinch.
    if (pointers.size === 2) {
      drag = null;
      pan = null;
      const g = twoPointerGeom();
      if (g) pinch = { lastDist: g.dist, lastMid: g.mid };
      opts.onChange();
      return;
    }
    if (pointers.size > 2) return;

    // Single finger: grab a head/tail, else stage a pan-or-tap.
    const g = grabEndAt(p);
    if (g) {
      drag = { ...g, pointerId: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      opts.onChange();
    } else {
      canvas.setPointerCapture(e.pointerId);
      pan = {
        pointerId: e.pointerId,
        last: p,
        moved: false,
        tapCell: renderer.cellAt(p.x, p.y, state),
      };
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (opts.enabled && !opts.enabled()) return;
    const state = opts.getState();
    if (!state) return;
    const p = point(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

    if (pinch) {
      const g = twoPointerGeom();
      if (g) {
        renderer.zoomAround(g.mid.x, g.mid.y, g.dist / pinch.lastDist);
        renderer.panBy(g.mid.x - pinch.lastMid.x, g.mid.y - pinch.lastMid.y);
        pinch.lastDist = g.dist;
        pinch.lastMid = g.mid;
        opts.onChange();
      }
      return;
    }

    if (drag && e.pointerId === drag.pointerId) {
      const cell = renderer.cellAt(p.x, p.y, state);
      if (cell) {
        const before = opts.getState();
        stepToward(cell);
        if (opts.getState() !== before) opts.onChange();
      }
      return;
    }

    if (pan && e.pointerId === pan.pointerId) {
      const dx = p.x - pan.last.x;
      const dy = p.y - pan.last.y;
      if (!pan.moved && Math.hypot(dx, dy) > TAP_SLOP) pan.moved = true;
      if (pan.moved && renderer.canPan()) {
        renderer.panBy(dx, dy);
        opts.onChange();
      }
      pan.last = p;
      return;
    }

    const cell = renderer.cellAt(p.x, p.y, state);
    const grabbable = !state.solved && cell !== null && grabEndAt(p) !== null;
    canvas.style.cursor = grabbable
      ? "grab"
      : (opts.cursorFor?.(cell) ?? "default");
  };

  const onUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);

    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        // Hand a leftover finger back to panning without a jump.
        if (pointers.size === 1) {
          const [id, pos] = [...pointers.entries()][0];
          pan = { pointerId: id, last: pos, moved: true, tapCell: null };
        }
        opts.onChange();
      }
      return;
    }

    if (drag && e.pointerId === drag.pointerId) {
      drag = null;
      opts.onChange();
      return;
    }

    if (pan && e.pointerId === pan.pointerId) {
      const tapCell = pan.tapCell;
      const wasTap = !pan.moved;
      pan = null;
      if (wasTap && tapCell) opts.onCellTap?.(tapCell);
      else opts.onChange();
    }
  };

  const onWheel = (e: WheelEvent): void => {
    if (opts.enabled && !opts.enabled()) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    // Ctrl+wheel is the trackpad pinch gesture; treat both as zoom.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    if (renderer.zoomAround(e.clientX - rect.left, e.clientY - rect.top, factor))
      opts.onChange();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    detach() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      drag = null;
      pan = null;
      pinch = null;
      pointers.clear();
    },
    currentDrag: () =>
      drag ? { trainId: drag.trainId, end: drag.end } : null,
  };
}
