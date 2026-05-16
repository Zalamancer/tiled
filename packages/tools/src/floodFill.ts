// Port of `TilePainter::computePaintableFillRegion` / Tiled's flood-fill.
//
// 4-connected fill over cells where `match(cellAt(x, y))` returns true.
// Boundary is the layer's `[0, width) × [0, height)` rect.

import { Cell, type Point, type TileLayer, TileRegion } from '@tiled-ts/core';

export function floodFillRegion(
  layer: TileLayer,
  seed: Point,
  match: (cell: Cell) => boolean,
): TileRegion {
  const region = new TileRegion();
  if (!layer.contains(seed.x, seed.y)) return region;
  if (!match(layer.cellAt(seed.x, seed.y))) return region;

  const w = layer.width;
  const h = layer.height;
  const stack: [number, number][] = [[seed.x, seed.y]];
  const visited = new Uint8Array(w * h);
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (!match(layer.cellAt(x, y))) continue;
    visited[idx] = 1;
    region.addCell(x, y);
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
  return region;
}

/**
 * Helper: returns a function that returns `true` when the input cell equals
 * any of `cells`. Mirrors how BucketFillTool compares against the seed cells.
 */
export function matchAny(cells: Cell[]): (c: Cell) => boolean {
  return (c) => cells.some((m) => c.equals(m));
}
