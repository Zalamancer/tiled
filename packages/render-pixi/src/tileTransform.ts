// Translates a Tiled cell's flip-flags (H, V, antidiagonal) into a PIXI sprite
// transform — center-anchored rotation + scale + center-offset translation.
// Mirrors `CellRenderer::render` in libtiled (maprenderer.cpp ~L500-525).

import type { Cell, Size } from '@tiled-ts/core';

export interface SpriteTransform {
  /** Centre-of-cell offset to add to (cellPx, cellPy). */
  centerX: number;
  centerY: number;
  /** Rotation in radians (positive = clockwise, matching Pixi & Qt). */
  rotation: number;
  /** Horizontal scale; -1 = horizontal flip. */
  scaleX: number;
  /** Vertical scale; -1 = vertical flip. */
  scaleY: number;
}

/**
 * Compute the centre-anchored transform for one cell. `cellSize` is the
 * rendered size in pixels (usually `map.tileSize`).
 */
export function tileTransformFor(cell: Cell, cellSize: Size): SpriteTransform {
  let flippedH = cell.flippedHorizontally();
  let flippedV = cell.flippedVertically();
  let rotation = 0;
  let centerX = cellSize.width / 2;
  let centerY = cellSize.height / 2;

  if (cell.flippedAntiDiagonally()) {
    rotation = Math.PI / 2;
    const newH = flippedV;
    const newV = !cell.flippedHorizontally();
    flippedH = newH;
    flippedV = newV;
    const halfDiff = cellSize.height / 2 - cellSize.width / 2;
    centerX += halfDiff;
    centerY += halfDiff;
  }

  return {
    centerX,
    centerY,
    rotation,
    scaleX: flippedH ? -1 : 1,
    scaleY: flippedV ? -1 : 1,
  };
}
