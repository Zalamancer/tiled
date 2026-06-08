// Translates a Tiled cell's flip-flags (H, V, antidiagonal) into a PIXI sprite
// transform — centre-anchored rotation + scale + offset relative to the cell's
// **bottom-left** screen point `(x*tw, (y+1)*th)`. This matches Tiled's
// orthogonal renderer (`CellRenderer::render` + `Origin::BottomLeft`):
// tiles render at their natural pixel size, anchored at the cell's bottom-
// left so larger sprites extend up and to the right.

import type { Cell, Size } from '@tiled-ts/core';

export interface SpriteTransform {
  /** Centre-of-sprite offset from `(x*tw, (y+1)*th)`. */
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
 * Compute the transform for one cell.
 *
 * `tileSize` is the **natural** pixel size of the tile image (i.e. the
 * tileset's `tileWidth/tileHeight` for image-based tilesets, or the per-tile
 * imageRect for image-collection tilesets). The returned `(centerX, centerY)`
 * are offsets from the cell's bottom-left point so the caller can plug them
 * straight into `sprite.position.set(x*tw + centerX, (y+1)*th + centerY)`.
 */
export function tileTransformFor(cell: Cell, tileSize: Size): SpriteTransform {
  let flippedH = cell.flippedHorizontally();
  let flippedV = cell.flippedVertically();
  let rotation = 0;
  // Start with bottom-left-anchored centring: sprite centre = (+w/2, -h/2).
  let centerX = tileSize.width / 2;
  let centerY = -tileSize.height / 2;

  if (cell.flippedAntiDiagonally()) {
    rotation = Math.PI / 2;
    const newH = flippedV;
    const newV = !cell.flippedHorizontally();
    flippedH = newH;
    flippedV = newV;
    // After a 90° CW rotation around the centre, a non-square sprite shifts
    // by `(h-w)/2` along both axes. Mirroring Qt's compensation in
    // `CellRenderer::render`.
    const halfDiff = tileSize.height / 2 - tileSize.width / 2;
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
