import { describe, expect, it } from 'vitest';

import { Map as TiledMap, MapOrientation, StaggerAxis, StaggerIndex } from '@tiled-ts/core';
import {
  OrthogonalRendererMath,
  IsometricRendererMath,
  HexagonalRendererMath,
  ObliqueRendererMath,
  createRendererMath,
} from '../src/index.js';

describe('OrthogonalRendererMath', () => {
  it('round-trips pixel ↔ tile', () => {
    const m = new TiledMap({ width: 10, height: 10, tileWidth: 32, tileHeight: 32 });
    const r = new OrthogonalRendererMath(m);
    const t = r.pixelToTileCoords(96, 64);
    expect(t).toEqual({ x: 3, y: 2 });
    const p = r.tileToPixelCoords(3, 2);
    expect(p).toEqual({ x: 96, y: 64 });
  });

  it('boundingRect scales by tile size', () => {
    const m = new TiledMap({ width: 10, height: 10, tileWidth: 16, tileHeight: 16 });
    const r = new OrthogonalRendererMath(m);
    const b = r.boundingRect({ x: 1, y: 2, width: 3, height: 4 });
    expect(b).toEqual({ x: 16, y: 32, width: 48, height: 64 });
  });
});

describe('IsometricRendererMath', () => {
  it('tile (0,0) maps to top vertex of the diamond', () => {
    const m = new TiledMap({
      orientation: MapOrientation.Isometric,
      width: 4,
      height: 4,
      tileWidth: 64,
      tileHeight: 32,
    });
    const r = new IsometricRendererMath(m);
    const p = r.tileToScreenCoords(0, 0);
    // origin x = h * tw / 2 = 4*64/2 = 128
    expect(p).toEqual({ x: 128, y: 0 });
  });

  it('round-trips screen ↔ tile within the diamond', () => {
    const m = new TiledMap({
      orientation: MapOrientation.Isometric,
      width: 4,
      height: 4,
      tileWidth: 64,
      tileHeight: 32,
    });
    const r = new IsometricRendererMath(m);
    const t = r.screenToTileCoords(128, 0);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0);
  });
});

describe('HexagonalRendererMath', () => {
  it('produces non-zero positions for staggerY/odd', () => {
    const m = new TiledMap({
      orientation: MapOrientation.Hexagonal,
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      hexSideLength: 16,
      staggerAxis: StaggerAxis.StaggerY,
      staggerIndex: StaggerIndex.StaggerOdd,
    });
    const r = new HexagonalRendererMath(m);
    const p = r.tileToScreenCoords(1, 1); // odd row → indented by columnWidth
    // sideOffsetX=16, columnWidth=16, tileWidth=32, sideLengthX=0
    // pixelX = 1 * (32 + 0) + 16 = 48
    expect(p.x).toBe(48);
  });
});

describe('ObliqueRendererMath', () => {
  it('reduces to orthogonal when skews are zero', () => {
    const m = new TiledMap({
      orientation: MapOrientation.Oblique,
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      skewX: 0,
      skewY: 0,
    });
    const r = new ObliqueRendererMath(m);
    expect(r.tileToScreenCoords(2, 1)).toEqual({ x: 64, y: 32 });
    expect(r.screenToTileCoords(64, 32)).toEqual({ x: 2, y: 1 });
  });
});

describe('createRendererMath dispatch', () => {
  it('selects renderer by orientation', () => {
    const ortho = new TiledMap();
    const iso = new TiledMap({ orientation: MapOrientation.Isometric });
    const hex = new TiledMap({ orientation: MapOrientation.Hexagonal });
    const stag = new TiledMap({ orientation: MapOrientation.Staggered });
    const obl = new TiledMap({ orientation: MapOrientation.Oblique });
    expect(createRendererMath(ortho)).toBeInstanceOf(OrthogonalRendererMath);
    expect(createRendererMath(iso)).toBeInstanceOf(IsometricRendererMath);
    expect(createRendererMath(hex)).toBeInstanceOf(HexagonalRendererMath);
    expect(createRendererMath(stag).constructor.name).toMatch(/Staggered/);
    expect(createRendererMath(obl)).toBeInstanceOf(ObliqueRendererMath);
  });
});
