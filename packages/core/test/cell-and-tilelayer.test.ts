import { describe, expect, it } from 'vitest';

import {
  Cell,
  CellFlag,
  RotateDirection,
  TileLayer,
  TileRegion,
  Tileset,
  Tile,
  GidMapper,
  FlipDirection,
} from '../src/index.js';

describe('Cell flag bits', () => {
  it('rotateRight + rotateLeft cancel', () => {
    const c = new Cell();
    c.setFlippedHorizontally(true);
    const before = c.rawFlags;
    c.rotate(RotateDirection.RotateRight);
    c.rotate(RotateDirection.RotateLeft);
    expect(c.rawFlags).toBe(before);
  });

  it('two right-rotations equal one half-flip pair (no-op for plain cell)', () => {
    const c = new Cell();
    c.rotate(RotateDirection.RotateRight);
    c.rotate(RotateDirection.RotateRight);
    expect(c.flippedHorizontally()).toBe(true);
    expect(c.flippedVertically()).toBe(true);
  });

  it('Checked bit is preserved through rotation', () => {
    const c = new Cell();
    c.setChecked(true);
    c.rotate(RotateDirection.RotateRight);
    expect(c.checked()).toBe(true);
  });
});

describe('TileLayer chunked storage', () => {
  it('round-trips cells across chunk boundaries', () => {
    const ts = new Tileset('t', 16, 16);
    const tile = new Tile(0, ts);
    const layer = new TileLayer('main', 0, 0, 64, 64);
    layer.setCell(0, 0, new Cell(ts, tile.id));
    layer.setCell(15, 15, new Cell(ts, tile.id));
    layer.setCell(16, 16, new Cell(ts, tile.id)); // crosses into next chunk
    layer.setCell(63, 63, new Cell(ts, tile.id));

    expect(layer.cellAt(0, 0).tileset).toBe(ts);
    expect(layer.cellAt(15, 15).tileset).toBe(ts);
    expect(layer.cellAt(16, 16).tileset).toBe(ts);
    expect(layer.cellAt(63, 63).tileset).toBe(ts);
    expect(layer.cellAt(50, 50).isEmpty()).toBe(true);
  });

  it('flip horizontally inverts X and toggles flag', () => {
    const ts = new Tileset('t', 16, 16);
    const layer = new TileLayer('l', 0, 0, 4, 1);
    layer.setCell(0, 0, new Cell(ts, 0));
    layer.setCell(1, 0, new Cell(ts, 1));
    layer.flip(FlipDirection.FlipHorizontally);
    expect(layer.cellAt(3, 0).tileId).toBe(0);
    expect(layer.cellAt(2, 0).tileId).toBe(1);
    expect(layer.cellAt(3, 0).flippedHorizontally()).toBe(true);
  });

  it('region() returns occupied cells', () => {
    const ts = new Tileset('t', 16, 16);
    const layer = new TileLayer('l', 0, 0, 8, 8);
    layer.setCell(2, 3, new Cell(ts, 0));
    layer.setCell(5, 7, new Cell(ts, 0));
    const r = layer.region();
    expect(r.cellCount()).toBe(2);
    expect(r.contains({ x: 2, y: 3 })).toBe(true);
    expect(r.contains({ x: 5, y: 7 })).toBe(true);
  });
});

describe('TileRegion ops', () => {
  it('union and subtract behave like sets', () => {
    const a = TileRegion.fromRect({ x: 0, y: 0, width: 3, height: 1 });
    const b = TileRegion.fromRect({ x: 2, y: 0, width: 3, height: 1 });
    const u = a.unite(b);
    expect(u.cellCount()).toBe(5);
    const d = u.subtracted(a);
    expect(d.cellCount()).toBe(2);
    expect(d.contains({ x: 3, y: 0 })).toBe(true);
    expect(d.contains({ x: 4, y: 0 })).toBe(true);
  });

  it('rects() horizontal-run-decomposes a single row', () => {
    const r = TileRegion.fromRect({ x: 5, y: 5, width: 3, height: 1 });
    const rects = r.rects();
    expect(rects).toEqual([{ x: 5, y: 5, width: 3, height: 1 }]);
  });
});

describe('GidMapper round-trip', () => {
  it('encodes and decodes flip flags', () => {
    const ts = new Tileset('t', 16, 16);
    ts.findOrCreateTile(0);
    ts.findOrCreateTile(1);
    const gm = new GidMapper();
    gm.insert(1, ts);

    const c = new Cell(ts, 1);
    c.rawFlags = CellFlag.FlippedHorizontally | CellFlag.FlippedAntiDiagonally;
    const gid = gm.cellToGid(c);
    const { cell: back, ok } = gm.gidToCell(gid);
    expect(ok).toBe(true);
    expect(back.tileId).toBe(1);
    expect(back.flippedHorizontally()).toBe(true);
    expect(back.flippedAntiDiagonally()).toBe(true);
  });

  it('returns empty cell for gid 0', () => {
    const gm = new GidMapper();
    const { cell, ok } = gm.gidToCell(0);
    expect(ok).toBe(true);
    expect(cell.isEmpty()).toBe(true);
  });
});
