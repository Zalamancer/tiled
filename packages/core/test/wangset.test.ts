import { describe, expect, it } from 'vitest';

import {
  WangId,
  WangIndex,
  WangIdMask,
  WangSet,
  WangSetType,
  WangColor,
  Tileset,
  WANG_MAX_COLOR_COUNT,
} from '../src/index.js';

describe('WangId — bit packing', () => {
  it('round-trips per-index colors', () => {
    const id = new WangId();
    id.setIndexColor(WangIndex.Top, 1);
    id.setIndexColor(WangIndex.Right, 4);
    id.setIndexColor(WangIndex.BottomRight, 7);
    id.setIndexColor(WangIndex.TopLeft, WANG_MAX_COLOR_COUNT);

    expect(id.indexColor(WangIndex.Top)).toBe(1);
    expect(id.indexColor(WangIndex.Right)).toBe(4);
    expect(id.indexColor(WangIndex.BottomRight)).toBe(7);
    expect(id.indexColor(WangIndex.TopLeft)).toBe(WANG_MAX_COLOR_COUNT);
    expect(id.indexColor(WangIndex.Bottom)).toBe(0);
  });

  it('toString / fromString are inverse', () => {
    const id = new WangId();
    id.setIndexColor(0, 1);
    id.setIndexColor(2, 3);
    id.setIndexColor(4, 5);
    const s = id.toString();
    expect(s).toBe('1,0,3,0,5,0,0,0');
    const { id: parsed, ok } = WangId.fromString(s);
    expect(ok).toBe(true);
    expect(parsed.equals(id)).toBe(true);
  });

  it('rejects out-of-range colors', () => {
    const { ok } = WangId.fromString(`${WANG_MAX_COLOR_COUNT + 1},0,0,0,0,0,0,0`);
    expect(ok).toBe(false);
  });

  it('rotated by 4 returns to original', () => {
    const id = new WangId();
    id.setIndexColor(0, 1);
    id.setIndexColor(1, 2);
    id.setIndexColor(2, 3);
    const r = id.rotated(4);
    expect(r.equals(id)).toBe(true);
  });

  it('flipHorizontally swaps Left/Right edges and corner pairs', () => {
    const id = new WangId();
    id.setIndexColor(WangIndex.Left, 1);
    id.setIndexColor(WangIndex.Right, 2);
    id.setIndexColor(WangIndex.TopLeft, 3);
    id.setIndexColor(WangIndex.TopRight, 4);
    const f = id.flippedHorizontally();
    expect(f.indexColor(WangIndex.Left)).toBe(2);
    expect(f.indexColor(WangIndex.Right)).toBe(1);
    expect(f.indexColor(WangIndex.TopLeft)).toBe(4);
    expect(f.indexColor(WangIndex.TopRight)).toBe(3);
  });
});

describe('WangSet basics', () => {
  it('manages color insertion / removal preserving indexes', () => {
    const ts = new Tileset('terrain', 16, 16);
    const ws = new WangSet(ts, 'grass', WangSetType.Mixed);
    ws.setColorCount(3);
    expect(ws.colorCount()).toBe(3);
    expect(ws.colorAt(1)?.colorIndex).toBe(1);
    expect(ws.colorAt(3)?.colorIndex).toBe(3);

    const removed = ws.takeWangColorAt(2);
    expect(removed?.colorIndex).toBe(2);
    expect(ws.colorCount()).toBe(2);
    expect(ws.colorAt(2)?.colorIndex).toBe(2);
  });

  it('typeMask reflects WangSet.type', () => {
    const ts = new Tileset('t', 16, 16);
    const ws = new WangSet(ts, 'edges', WangSetType.Edge);
    expect(ws.typeMask().toBigInt()).toBe(WangIdMask.Edges);
    ws.setType(WangSetType.Corner);
    expect(ws.typeMask().toBigInt()).toBe(WangIdMask.Corners);
    ws.setType(WangSetType.Mixed);
    expect(ws.typeMask().toBigInt()).toBe(WangIdMask.Full);
  });

  it('setWangId stores and reads back', () => {
    const ts = new Tileset('t', 16, 16);
    const ws = new WangSet(ts, 's', WangSetType.Mixed);
    ws.setColorCount(4);
    const id = new WangId();
    id.setIndexColor(0, 1);
    id.setIndexColor(2, 2);
    id.setIndexColor(4, 3);
    id.setIndexColor(6, 4);
    ws.setWangId(7, id);
    expect(ws.wangIdByTileId().get(7)?.equals(id)).toBe(true);
  });

  it('templateWangIdAt(0) returns 1,1,1,1,1,1,1,1 for mixed sets', () => {
    const ts = new Tileset('t', 16, 16);
    const ws = new WangSet(ts, 's', WangSetType.Mixed);
    ws.setColorCount(2);
    const w = ws.templateWangIdAt(0);
    expect(w.toString()).toBe('1,1,1,1,1,1,1,1');
  });
});

describe('WangColor.distanceToColor', () => {
  it('returns 0 for self-distance after recalculation', () => {
    const ts = new Tileset('t', 16, 16);
    const ws = new WangSet(ts, 's', WangSetType.Edge);
    ws.setColorCount(2);
    // Add a tile that uses both colors
    const id = new WangId();
    id.setEdgeColor(0, 1); // top
    id.setEdgeColor(2, 2); // bottom
    ws.setWangId(0, id);
    expect(ws.transitionPenalty(1, 1)).toBe(0);
    expect(ws.transitionPenalty(2, 2)).toBe(0);
    // Color 1 and color 2 share a tile, so distance is 1
    expect(ws.transitionPenalty(1, 2)).toBe(1);
  });
});

describe('WangColor object', () => {
  it('default constructs sensibly', () => {
    const c = new WangColor();
    expect(c.colorIndex).toBe(0);
    expect(c.color).toBe('#ff0000');
    expect(c.probability).toBe(1);
  });
});
