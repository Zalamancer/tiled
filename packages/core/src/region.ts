// Lightweight stand-in for `QRegion` used by `TileLayer::region`,
// `paintTileLayer`, brush hit-tests, and so on.
//
// We back the region with a `Set<number>` keyed by `(y * STRIDE + x)` for
// fast point-tests; rect ops translate to bulk add/remove. `rects()` produces
// a deterministic axis-aligned decomposition by horizontal-run grouping.

import type { Rect, Point } from './types.js';

const STRIDE = 0x100000; // ±524288 cell range — fits comfortably in i32.
const HALF = STRIDE >> 1;

function key(x: number, y: number): number {
  // Shift into non-negative coordinates so the key is monotonic in (y, x).
  return (y + HALF) * STRIDE + (x + HALF);
}

function unkey(k: number): Point {
  const xy = k;
  const y = Math.floor(xy / STRIDE) - HALF;
  const x = (xy - (y + HALF) * STRIDE) - HALF;
  return { x, y };
}

export class TileRegion {
  private cells = new Set<number>();

  static fromRect(rect: Rect): TileRegion {
    const r = new TileRegion();
    r.addRect(rect);
    return r;
  }

  isEmpty(): boolean {
    return this.cells.size === 0;
  }

  cellCount(): number {
    return this.cells.size;
  }

  contains(p: Point): boolean {
    return this.cells.has(key(p.x, p.y));
  }

  addCell(x: number, y: number): void {
    this.cells.add(key(x, y));
  }
  removeCell(x: number, y: number): void {
    this.cells.delete(key(x, y));
  }

  addRect(rect: Rect): void {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        this.cells.add(key(x, y));
      }
    }
  }

  removeRect(rect: Rect): void {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        this.cells.delete(key(x, y));
      }
    }
  }

  /** Set-union with another region. */
  unite(other: TileRegion): TileRegion {
    const out = new TileRegion();
    for (const k of this.cells) out.cells.add(k);
    for (const k of other.cells) out.cells.add(k);
    return out;
  }

  /** Set-difference. */
  subtracted(other: TileRegion): TileRegion {
    const out = new TileRegion();
    for (const k of this.cells) {
      if (!other.cells.has(k)) out.cells.add(k);
    }
    return out;
  }

  /** Set-intersection. */
  intersected(other: TileRegion): TileRegion {
    const out = new TileRegion();
    for (const k of this.cells) {
      if (other.cells.has(k)) out.cells.add(k);
    }
    return out;
  }

  /** Translate every cell by `(dx, dy)`. */
  translated(dx: number, dy: number): TileRegion {
    const out = new TileRegion();
    for (const k of this.cells) {
      const p = unkey(k);
      out.cells.add(key(p.x + dx, p.y + dy));
    }
    return out;
  }

  boundingRect(): Rect {
    if (this.cells.size === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const k of this.cells) {
      const p = unkey(k);
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
    return { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
  }

  /** Decompose into axis-aligned rectangles by greedy horizontal-run grouping. */
  rects(): Rect[] {
    if (this.cells.size === 0) return [];
    const points = Array.from(this.cells, unkey).sort((a, b) =>
      a.y === b.y ? a.x - b.x : a.y - b.y,
    );
    const rects: Rect[] = [];
    let runStart = points[0]!;
    let runEnd = points[0]!.x;
    for (let i = 1; i < points.length; i++) {
      const p = points[i]!;
      if (p.y === runStart.y && p.x === runEnd + 1) {
        runEnd = p.x;
      } else {
        rects.push({ x: runStart.x, y: runStart.y, width: runEnd - runStart.x + 1, height: 1 });
        runStart = p;
        runEnd = p.x;
      }
    }
    rects.push({ x: runStart.x, y: runStart.y, width: runEnd - runStart.x + 1, height: 1 });
    return rects;
  }

  /** Iterates each contained cell as a `{x, y}` point. */
  *[Symbol.iterator](): IterableIterator<Point> {
    for (const k of this.cells) yield unkey(k);
  }
}
