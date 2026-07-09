import {
  FIXED_COLOR,
  isEndDocked,
  key,
  occupancy,
  playCellAt,
  trackSet,
  visibleHintMarks,
} from "@spellwound/core";
import type { End, GameState, Vec } from "@spellwound/core";

const SOLVED_COLOR = "#41474c";
const LETTER_COLOR = "#ffffff";
const SOLVED_LETTER_COLOR = "#f4efe3";
const GRID_LINE = "#e7e7e7";
const GRID_DOT = "#c9c9c9";
const PLAY_BORDER = "rgba(90, 125, 205, 0.5)";
const STIPPLE = "rgba(90, 125, 205, 0.55)";
const TRACK_BORDER = "rgba(150, 152, 155, 0.45)";
const TRACK_STIPPLE = "rgba(150, 152, 155, 0.5)";
const TRACK_CIRCLE = "rgba(150, 152, 155, 0.6)";

export interface DragVisual {
  trainId: string;
  end: End;
}

/**
 * Canvas 2D board renderer. Full redraw on every state change — the board is
 * small, so this is far simpler than dirty-rect tracking and still instant.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Pixel size of one grid cell (CSS px). */
  cell = 64;
  /** Canvas-space origin of grid cell (0,0), in CSS px. */
  origin: Vec = { x: 0, y: 0 };
  private stipplePattern: CanvasPattern | null = null;
  private trackPattern: CanvasPattern | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /**
   * Fit the puzzle into the viewport with margins for HUD chrome. Sizing is
   * driven by the CONTENT bounding box (the movement track), not the full
   * grid — so wide grids still fit a phone in portrait with readable cells.
   */
  layout(state: GameState): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of trackSet(state.puzzle)) {
      const [x, y] = k.split(",").map(Number);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = state.puzzle.gridWidth - 1;
      maxY = state.puzzle.gridHeight - 1;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const portrait = h > w;
    const marginX = Math.max(14, w * (portrait ? 0.03 : 0.06));
    const marginTop = Math.min(170, Math.max(64, h * 0.17));
    const marginBottom = Math.max(70, h * 0.11);
    this.cell = Math.max(
      20,
      Math.min(
        84,
        Math.floor(
          Math.min(
            (w - marginX * 2) / bw,
            (h - marginTop - marginBottom) / bh,
          ),
        ),
      ),
    );
    this.origin = {
      x: Math.round((w - bw * this.cell) / 2 - minX * this.cell),
      y: Math.round(
        marginTop +
          (h - marginTop - marginBottom - bh * this.cell) / 2 -
          minY * this.cell,
      ),
    };
  }

  /** Grid cell under a canvas-space point, or null when outside the grid. */
  cellAt(px: number, py: number, state: GameState): Vec | null {
    const x = Math.floor((px - this.origin.x) / this.cell);
    const y = Math.floor((py - this.origin.y) / this.cell);
    if (x < 0 || y < 0 || x >= state.puzzle.gridWidth || y >= state.puzzle.gridHeight)
      return null;
    return { x, y };
  }

  /** Center of a grid cell in canvas CSS px. */
  cellCenter(v: Vec): Vec {
    return {
      x: this.origin.x + (v.x + 0.5) * this.cell,
      y: this.origin.y + (v.y + 0.5) * this.cell,
    };
  }

  draw(state: GameState, drag: DragVisual | null): void {
    const { ctx } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fdfdfd";
    ctx.fillRect(0, 0, w, h);

    this.drawBackgroundGrid(w, h);
    this.drawTrackCells(state);
    this.drawPlayCells(state);
    this.drawHints(state);
    this.drawFixedBlocks(state);
    this.drawTrains(state, drag);
  }

  /**
   * Background grid covering the whole viewport, aligned to the puzzle grid:
   * light lines every 2 cells, small dots at intermediate intersections.
   */
  private drawBackgroundGrid(w: number, h: number): void {
    const { ctx, cell, origin } = this;
    const startX = origin.x - Math.ceil(origin.x / cell) * cell;
    const startY = origin.y - Math.ceil(origin.y / cell) * cell;

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    const majorOffsetX = Math.round((origin.x / cell) % 2);
    const majorOffsetY = Math.round((origin.y / cell) % 2);
    let i = 0;
    for (let x = startX; x <= w + cell; x += cell, i++) {
      if ((i + majorOffsetX) % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
    }
    i = 0;
    for (let y = startY; y <= h + cell; y += cell, i++) {
      if ((i + majorOffsetY) % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
    }

    ctx.fillStyle = GRID_DOT;
    for (let x = startX; x <= w + cell; x += cell) {
      for (let y = startY; y <= h + cell; y += cell) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private makeStipple(color: string): CanvasPattern {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 7;
    const tctx = tile.getContext("2d")!;
    tctx.fillStyle = color;
    tctx.beginPath();
    tctx.arc(2, 2, 0.9, 0, Math.PI * 2);
    tctx.fill();
    return this.ctx.createPattern(tile, "repeat")!;
  }

  private getStipple(): CanvasPattern {
    return (this.stipplePattern ??= this.makeStipple(STIPPLE));
  }

  private getTrackStipple(): CanvasPattern {
    return (this.trackPattern ??= this.makeStipple(TRACK_STIPPLE));
  }

  /**
   * Movement-track cells that are not crossword slots (train starting
   * footprints and declared corridors): gray stipple with a small circle,
   * per the original's vacated-start look. Trains draw over them.
   */
  private drawTrackCells(state: GameState): void {
    const { ctx, cell } = this;
    const playKeys = new Set(state.puzzle.playCells.map((pc) => key(pc)));
    for (const k of trackSet(state.puzzle)) {
      if (playKeys.has(k)) continue;
      const [cx, cy] = k.split(",").map(Number);
      const x = this.origin.x + cx * cell;
      const y = this.origin.y + cy * cell;
      ctx.fillStyle = this.getTrackStipple();
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = TRACK_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      ctx.strokeStyle = TRACK_CIRCLE;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Crossword slots: stippled blue fill with a thin blue border. */
  private drawPlayCells(state: GameState): void {
    const { ctx, cell } = this;
    for (const pc of state.puzzle.playCells) {
      const x = this.origin.x + pc.x * cell;
      const y = this.origin.y + pc.y * cell;
      ctx.fillStyle = this.getStipple();
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = PLAY_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
    if (state.puzzle.blocked) {
      ctx.fillStyle = "#dadada";
      for (const b of state.puzzle.blocked) {
        ctx.fillRect(this.origin.x + b.x * cell, this.origin.y + b.y * cell, cell, cell);
      }
    }
  }

  /** Colored corner triangles marking where a train's head / tail must rest. */
  private drawHints(state: GameState): void {
    const { ctx, cell } = this;
    const occ = occupancy(state);
    for (const mark of visibleHintMarks(state)) {
      // Hide the mark once a block covers the cell (the block draws on top anyway).
      if (occ.has(key(mark.cell))) continue;
      const train = state.puzzle.trains.find((t) => t.id === mark.trainId)!;
      const x = this.origin.x + mark.cell.x * cell;
      const y = this.origin.y + mark.cell.y * cell;
      const s = cell * 0.34;
      ctx.fillStyle = train.color;
      ctx.beginPath();
      if (mark.end === "head") {
        // top-left corner triangle — matches the head block's notch
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + 1 + s, y + 1);
        ctx.lineTo(x + 1, y + 1 + s);
      } else {
        // bottom-right corner triangle — matches the tail block's notch
        ctx.moveTo(x + cell - 1, y + cell - 1);
        ctx.lineTo(x + cell - 1 - s, y + cell - 1);
        ctx.lineTo(x + cell - 1, y + cell - 1 - s);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Immovable pre-filled blocks: solid gray squares carrying their play
   * cell's solution letter. They never move and have no head/tail notch.
   */
  private drawFixedBlocks(state: GameState): void {
    const { ctx, cell } = this;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const fb of state.puzzle.fixedBlocks ?? []) {
      const pc = playCellAt(state.puzzle, fb);
      const x = this.origin.x + fb.x * cell;
      const y = this.origin.y + fb.y * cell;
      ctx.fillStyle = FIXED_COLOR;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(cell * 0.52)}px "Segoe UI", "Helvetica Neue", system-ui, sans-serif`;
      ctx.fillText(pc?.letter ?? "", x + cell / 2, y + cell / 2 + cell * 0.03);
    }
  }

  private drawTrains(state: GameState, drag: DragVisual | null): void {
    const { ctx, cell } = this;
    for (const ts of state.trains) {
      const def = state.puzzle.trains.find((t) => t.id === ts.id)!;
      const color = state.solved ? SOLVED_COLOR : def.color;
      ts.cells.forEach((c, i) => {
        const x = this.origin.x + c.x * cell;
        const y = this.origin.y + c.y * cell;
        const isHead = i === 0;
        const isTail = i === ts.cells.length - 1;
        const grabbed =
          drag !== null &&
          drag.trainId === ts.id &&
          ((drag.end === "head" && isHead) || (drag.end === "tail" && isTail));

        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);

        // Notches: empty triangular holes on head (top-left) and tail
        // (bottom-right). When the end rests on its hint mark the notch
        // "fits" — the hole fills in and the block renders solid.
        const docked =
          (isHead && isEndDocked(state, ts.id, "head")) ||
          (isTail && isEndDocked(state, ts.id, "tail"));
        if (!state.solved && (isHead || isTail) && !docked) {
          const s = cell * 0.34;
          ctx.fillStyle = "#fdfdfd";
          ctx.beginPath();
          if (isHead) {
            ctx.moveTo(x + 1, y + 1);
            ctx.lineTo(x + 1 + s, y + 1);
            ctx.lineTo(x + 1, y + 1 + s);
          } else {
            ctx.moveTo(x + cell - 1, y + cell - 1);
            ctx.lineTo(x + cell - 1 - s, y + cell - 1);
            ctx.lineTo(x + cell - 1, y + cell - 1 - s);
          }
          ctx.closePath();
          ctx.fill();
        }

        if (grabbed) {
          ctx.strokeStyle = "rgba(60, 65, 70, 0.55)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
        }

        ctx.fillStyle = state.solved ? SOLVED_LETTER_COLOR : LETTER_COLOR;
        ctx.font = `700 ${Math.round(cell * 0.52)}px "Segoe UI", "Helvetica Neue", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(def.letters[i], x + cell / 2, y + cell / 2 + cell * 0.03);
      });
    }
  }

  /** Is this cell an empty crossword slot (clickable for a clue)? */
  isEmptyPlayCell(state: GameState, cell: Vec): boolean {
    return (
      playCellAt(state.puzzle, cell) !== undefined &&
      !occupancy(state).has(key(cell))
    );
  }
}
