// Port of libtiled/orthogonalrenderer.cpp — coordinate-conversion subset.

import type { Map, Point, Rect } from '@tiled-ts/core';
import { CellType, type MapRendererMath } from './types.js';

export class OrthogonalRendererMath implements MapRendererMath {
  readonly cellType = CellType.OrthogonalCells;

  constructor(public readonly map: Map) {}

  pixelToTileCoords(x: number, y: number): Point {
    return { x: x / this.map.tileWidth, y: y / this.map.tileHeight };
  }
  tileToPixelCoords(x: number, y: number): Point {
    return { x: x * this.map.tileWidth, y: y * this.map.tileHeight };
  }
  screenToTileCoords(x: number, y: number): Point {
    return this.pixelToTileCoords(x, y);
  }
  tileToScreenCoords(x: number, y: number): Point {
    return this.tileToPixelCoords(x, y);
  }
  // For orthogonal maps screen and pixel space coincide.
  screenToPixelCoords(x: number, y: number): Point {
    return { x, y };
  }
  pixelToScreenCoords(x: number, y: number): Point {
    return { x, y };
  }

  boundingRect(rect: Rect): Rect {
    return {
      x: rect.x * this.map.tileWidth,
      y: rect.y * this.map.tileHeight,
      width: rect.width * this.map.tileWidth,
      height: rect.height * this.map.tileHeight,
    };
  }

  mapBoundingRect(): Rect {
    return this.boundingRect({ x: 0, y: 0, width: this.map.width, height: this.map.height });
  }
}
