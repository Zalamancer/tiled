// Shared types for the render-math package.

import type { Map, Point, Rect } from '@tiled-ts/core';

export enum CellType {
  OrthogonalCells = 0,
  HexagonalCells = 1,
}

/** Pure-math interface implemented by every renderer. */
export interface MapRendererMath {
  readonly map: Map;
  readonly cellType: CellType;

  pixelToTileCoords(x: number, y: number): Point;
  tileToPixelCoords(x: number, y: number): Point;

  screenToTileCoords(x: number, y: number): Point;
  tileToScreenCoords(x: number, y: number): Point;

  screenToPixelCoords(x: number, y: number): Point;
  pixelToScreenCoords(x: number, y: number): Point;

  /** Bounding box in pixels of a rectangle of tiles. */
  boundingRect(rect: Rect): Rect;

  /** Bounding box in pixels of the entire map. */
  mapBoundingRect(): Rect;
}
