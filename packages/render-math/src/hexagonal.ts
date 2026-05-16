// Port of libtiled/hexagonalrenderer.cpp — coordinate-conversion subset.
//
// Supports both flat-top (`staggerX`) and pointy-top (`staggerY`) hex layouts
// via Tiled's `staggerAxis` / `staggerIndex` enums.

import type { Map, Point, Rect } from '@tiled-ts/core';
import { MapOrientation, StaggerAxis, StaggerIndex } from '@tiled-ts/core';
import { CellType, type MapRendererMath } from './types.js';

interface HexParams {
  staggerX: boolean;
  staggerEven: boolean;
  sideLengthX: number;
  sideLengthY: number;
  sideOffsetX: number;
  sideOffsetY: number;
  columnWidth: number;
  rowHeight: number;
  tileWidth: number;
  tileHeight: number;
}

function paramsFor(map: Map): HexParams {
  const staggerX = map.staggerAxis === StaggerAxis.StaggerX;
  const staggerEven = map.staggerIndex === StaggerIndex.StaggerEven;
  let sideLengthX = 0;
  let sideLengthY = 0;
  if (map.orientation === MapOrientation.Hexagonal) {
    if (staggerX) sideLengthX = map.hexSideLength;
    else sideLengthY = map.hexSideLength;
  }
  const sideOffsetX = (map.tileWidth - sideLengthX) / 2;
  const sideOffsetY = (map.tileHeight - sideLengthY) / 2;
  const columnWidth = sideOffsetX + sideLengthX;
  const rowHeight = sideOffsetY + sideLengthY;
  const tileWidth = columnWidth + sideOffsetX;
  const tileHeight = rowHeight + sideOffsetY;
  return {
    staggerX,
    staggerEven,
    sideLengthX,
    sideLengthY,
    sideOffsetX,
    sideOffsetY,
    columnWidth,
    rowHeight,
    tileWidth,
    tileHeight,
  };
}

function doStaggerX(p: HexParams, x: number): boolean {
  return ((x & 1) === 1) !== p.staggerEven;
}
function doStaggerY(p: HexParams, y: number): boolean {
  return ((y & 1) === 1) !== p.staggerEven;
}

export class HexagonalRendererMath implements MapRendererMath {
  readonly cellType = CellType.HexagonalCells;

  constructor(public readonly map: Map) {}

  pixelToTileCoords(x: number, y: number): Point {
    return this.screenToTileCoords(x, y);
  }
  tileToPixelCoords(x: number, y: number): Point {
    return this.tileToScreenCoords(x, y);
  }
  screenToPixelCoords(x: number, y: number): Point {
    return { x, y };
  }
  pixelToScreenCoords(x: number, y: number): Point {
    return { x, y };
  }

  tileToScreenCoords(x: number, y: number): Point {
    const p = paramsFor(this.map);
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    let px: number;
    let py: number;
    if (p.staggerX) {
      py = ty * (p.tileHeight + p.sideLengthY);
      if (doStaggerX(p, tx)) py += p.rowHeight;
      px = tx * p.columnWidth;
    } else {
      px = tx * (p.tileWidth + p.sideLengthX);
      if (doStaggerY(p, ty)) px += p.columnWidth;
      py = ty * p.rowHeight;
    }
    return { x: px, y: py };
  }

  screenToTileCoords(x: number, y: number): Point {
    const p = paramsFor(this.map);

    let xx = x;
    let yy = y;
    if (p.staggerX) xx -= p.staggerEven ? p.tileWidth : p.sideOffsetX;
    else yy -= p.staggerEven ? p.tileHeight : p.sideOffsetY;

    let refX = Math.floor(xx / (p.columnWidth * 2));
    let refY = Math.floor(yy / (p.rowHeight * 2));

    const relX = xx - refX * (p.columnWidth * 2);
    const relY = yy - refY * (p.rowHeight * 2);

    if (p.staggerX) {
      refX *= 2;
      if (p.staggerEven) refX += 1;
    } else {
      refY *= 2;
      if (p.staggerEven) refY += 1;
    }

    let centers: [number, number][];
    if (p.staggerX) {
      const left = p.sideLengthX / 2;
      const cx = left + p.columnWidth;
      const cy = p.tileHeight / 2;
      centers = [
        [left, cy],
        [cx, cy - p.rowHeight],
        [cx, cy + p.rowHeight],
        [cx + p.columnWidth, cy],
      ];
    } else {
      const top = p.sideLengthY / 2;
      const cx = p.tileWidth / 2;
      const cy = top + p.rowHeight;
      centers = [
        [cx, top],
        [cx - p.columnWidth, cy],
        [cx + p.columnWidth, cy],
        [cx, cy + p.rowHeight],
      ];
    }

    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < 4; i++) {
      const dx = centers[i]![0] - relX;
      const dy = centers[i]![1] - relY;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }

    const offsetsStaggerX: [number, number][] = [
      [0, 0],
      [+1, -1],
      [+1, 0],
      [+2, 0],
    ];
    const offsetsStaggerY: [number, number][] = [
      [0, 0],
      [-1, +1],
      [0, +1],
      [0, +2],
    ];
    const off = (p.staggerX ? offsetsStaggerX : offsetsStaggerY)[nearest]!;
    return { x: refX + off[0], y: refY + off[1] };
  }

  boundingRect(rect: Rect): Rect {
    const p = paramsFor(this.map);
    const tl = this.tileToScreenCoords(rect.x, rect.y);
    let tlx = tl.x;
    let tly = tl.y;
    let width: number;
    let height: number;

    if (p.staggerX) {
      width = rect.width * p.columnWidth + p.sideOffsetX;
      height = rect.height * (p.tileHeight + p.sideLengthY);
      if (rect.width > 1) {
        height += p.rowHeight;
        if (doStaggerX(p, rect.x)) tly -= p.rowHeight;
      }
    } else {
      width = rect.width * (p.tileWidth + p.sideLengthX);
      height = rect.height * p.rowHeight + p.sideOffsetY;
      if (rect.height > 1) {
        width += p.columnWidth;
        if (doStaggerY(p, rect.y)) tlx -= p.columnWidth;
      }
    }

    return { x: tlx, y: tly, width, height };
  }

  mapBoundingRect(): Rect {
    return this.boundingRect({ x: 0, y: 0, width: this.map.width, height: this.map.height });
  }
}

/** Staggered renderer reuses the hex layout with sideLength = 0. */
export class StaggeredRendererMath extends HexagonalRendererMath {}
