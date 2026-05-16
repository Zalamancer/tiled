// Port of libtiled/obliquerenderer.cpp — coordinate-conversion subset.
//
// Oblique maps are sheared variants of orthogonal maps; the renderer is just
// orthogonal math composed with a 2-D shear transform.

import type { Map, Point, Rect } from '@tiled-ts/core';
import { OrthogonalRendererMath } from './orthogonal.js';
import { CellType, type MapRendererMath } from './types.js';

/**
 * 2x3 row-major shear matrix `[a b 0; c d 0; tx ty 1]^T` reduced to `(a, b, c, d)`.
 */
function shear(map: Map): { a: number; b: number; c: number; d: number; det: number } {
  const tw = map.tileWidth;
  const th = map.tileHeight;
  if (tw === 0 || th === 0) return { a: 1, b: 0, c: 0, d: 1, det: 1 };
  const sx = map.parameters.skewX / th;
  const sy = map.parameters.skewY / tw;
  // QTransform.shear corresponds to: x' = x + sx*y, y' = sy*x + y
  const a = 1;
  const b = sx;
  const c = sy;
  const d = 1;
  return { a, b, c, d, det: a * d - b * c };
}

export class ObliqueRendererMath implements MapRendererMath {
  readonly cellType = CellType.OrthogonalCells;
  private readonly ortho: OrthogonalRendererMath;

  constructor(public readonly map: Map) {
    this.ortho = new OrthogonalRendererMath(map);
  }

  pixelToTileCoords(x: number, y: number): Point {
    return this.ortho.pixelToTileCoords(x, y);
  }
  tileToPixelCoords(x: number, y: number): Point {
    return this.ortho.tileToPixelCoords(x, y);
  }
  pixelToScreenCoords(x: number, y: number): Point {
    const t = shear(this.map);
    return { x: t.a * x + t.b * y, y: t.c * x + t.d * y };
  }
  screenToPixelCoords(x: number, y: number): Point {
    const t = shear(this.map);
    if (t.det === 0) return { x, y };
    const inv = 1 / t.det;
    return {
      x: (t.d * x - t.b * y) * inv,
      y: (-t.c * x + t.a * y) * inv,
    };
  }
  screenToTileCoords(x: number, y: number): Point {
    const p = this.screenToPixelCoords(x, y);
    return this.pixelToTileCoords(p.x, p.y);
  }
  tileToScreenCoords(x: number, y: number): Point {
    const p = this.tileToPixelCoords(x, y);
    return this.pixelToScreenCoords(p.x, p.y);
  }

  boundingRect(rect: Rect): Rect {
    const tl = this.tileToScreenCoords(rect.x, rect.y);
    const tr = this.tileToScreenCoords(rect.x + rect.width, rect.y);
    const bl = this.tileToScreenCoords(rect.x, rect.y + rect.height);
    const br = this.tileToScreenCoords(rect.x + rect.width, rect.y + rect.height);
    const xs = [tl.x, tr.x, bl.x, br.x];
    const ys = [tl.y, tr.y, bl.y, br.y];
    const x1 = Math.min(...xs);
    const y1 = Math.min(...ys);
    const x2 = Math.max(...xs);
    const y2 = Math.max(...ys);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  mapBoundingRect(): Rect {
    return this.boundingRect({ x: 0, y: 0, width: this.map.width, height: this.map.height });
  }
}

// Re-export so the index can advertise everything from one module.
export type { MapRendererMath };
