// Geometry & color primitives that replace Qt's QPoint/QSize/QRect/QColor/QMargins.
// These are deliberately plain readonly structs so they're cheap to copy and
// compare structurally, mirroring how Tiled passes Qt value-types around.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Margins {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** ARGB color in the canonical CSS hex form: `#RRGGBB` or `#AARRGGBB`. */
export type ColorString = string;

export const Point = {
  zero: { x: 0, y: 0 } as Point,
  of(x: number, y: number): Point {
    return { x, y };
  },
  add(a: Point, b: Point): Point {
    return { x: a.x + b.x, y: a.y + b.y };
  },
  sub(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y };
  },
  equals(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
  },
};

export const Size = {
  zero: { width: 0, height: 0 } as Size,
  of(width: number, height: number): Size {
    return { width, height };
  },
  isEmpty(s: Size): boolean {
    return s.width <= 0 || s.height <= 0;
  },
  equals(a: Size, b: Size): boolean {
    return a.width === b.width && a.height === b.height;
  },
};

export const Rect = {
  empty: { x: 0, y: 0, width: 0, height: 0 } as Rect,
  of(x: number, y: number, width: number, height: number): Rect {
    return { x, y, width, height };
  },
  isEmpty(r: Rect): boolean {
    return r.width <= 0 || r.height <= 0;
  },
  contains(r: Rect, p: Point): boolean {
    return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
  },
  intersects(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  },
  united(a: Rect, b: Rect): Rect {
    if (Rect.isEmpty(a)) return b;
    if (Rect.isEmpty(b)) return a;
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.width, b.x + b.width);
    const y2 = Math.max(a.y + a.height, b.y + b.height);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  },
  intersected(a: Rect, b: Rect): Rect {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    if (x2 <= x1 || y2 <= y1) return Rect.empty;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  },
  translated(r: Rect, dx: number, dy: number): Rect {
    return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
  },
};

export const Margins = {
  zero: { left: 0, top: 0, right: 0, bottom: 0 } as Margins,
  of(left: number, top: number, right: number, bottom: number): Margins {
    return { left, top, right, bottom };
  },
  max(a: Margins, b: Margins): Margins {
    return {
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    };
  },
  isZero(m: Margins): boolean {
    return m.left === 0 && m.top === 0 && m.right === 0 && m.bottom === 0;
  },
};
