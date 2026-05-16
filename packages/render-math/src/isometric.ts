// Port of libtiled/isometricrenderer.cpp — coordinate-conversion subset.

import type { Map, Point, Rect } from '@tiled-ts/core';
import { CellType, type MapRendererMath } from './types.js';

export class IsometricRendererMath implements MapRendererMath {
  readonly cellType = CellType.OrthogonalCells;

  constructor(public readonly map: Map) {}

  pixelToTileCoords(x: number, y: number): Point {
    const th = this.map.tileHeight;
    return { x: x / th, y: y / th };
  }

  tileToPixelCoords(x: number, y: number): Point {
    const th = this.map.tileHeight;
    return { x: x * th, y: y * th };
  }

  screenToTileCoords(x: number, y: number): Point {
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const xx = x - (this.map.height * tw) / 2;
    const tileY = y / th;
    const tileX = xx / tw;
    return { x: tileY + tileX, y: tileY - tileX };
  }

  tileToScreenCoords(x: number, y: number): Point {
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const originX = (this.map.height * tw) / 2;
    return { x: ((x - y) * tw) / 2 + originX, y: ((x + y) * th) / 2 };
  }

  screenToPixelCoords(x: number, y: number): Point {
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const xx = x - (this.map.height * tw) / 2;
    const tileY = y / th;
    const tileX = xx / tw;
    return { x: (tileY + tileX) * th, y: (tileY - tileX) * th };
  }

  pixelToScreenCoords(x: number, y: number): Point {
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const originX = (this.map.height * tw) / 2;
    const tileY = y / th;
    const tileX = x / th;
    return { x: ((tileX - tileY) * tw) / 2 + originX, y: ((tileX + tileY) * th) / 2 };
  }

  boundingRect(rect: Rect): Rect {
    const originX = this.map.height * this.map.tileWidth / 2;
    const pos = { x: (rect.x - (rect.y + rect.height)) * this.map.tileWidth / 2 + originX,
                  y: (rect.x + rect.y) * this.map.tileHeight / 2 };
    const sz = { width: (rect.width + rect.height) * this.map.tileWidth / 2,
                 height: (rect.width + rect.height) * this.map.tileHeight / 2 };
    return { x: pos.x, y: pos.y, width: sz.width, height: sz.height };
  }

  mapBoundingRect(): Rect {
    const sideLength = this.map.tileWidth * (this.map.width + this.map.height) / 2;
    return {
      x: 0,
      y: 0,
      width: sideLength,
      height: this.map.tileHeight * (this.map.width + this.map.height) / 2,
    };
  }
}
