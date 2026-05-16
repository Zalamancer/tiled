import { describe, expect, it } from 'vitest';

import { Cell, TileLayer, TileRegion, Tileset } from '@tiled-ts/core';

import { RandomPicker } from '../src/randomPicker.js';
import { TileStamp } from '../src/tileStamp.js';
import { floodFillRegion, matchAny } from '../src/floodFill.js';

describe('RandomPicker', () => {
  it('returns the only entry deterministically', () => {
    const picker = new RandomPicker<string>();
    picker.add('a', 1);
    expect(picker.pick()).toBe('a');
  });

  it('weights bias the result', () => {
    const picker = new RandomPicker<string>();
    picker.rng = () => 0.99; // forces last bucket
    picker.add('a', 1);
    picker.add('b', 1);
    expect(picker.pick()).toBe('b');
    picker.rng = () => 0;
    expect(picker.pick()).toBe('a');
  });

  it('take() removes the chosen element', () => {
    const picker = new RandomPicker<string>();
    picker.rng = () => 0;
    picker.add('a', 1);
    picker.add('b', 1);
    expect(picker.take()).toBe('a');
    expect(picker.size()).toBe(1);
  });
});

describe('TileStamp', () => {
  it('reports empty when every variation is empty', () => {
    const ts = new Tileset('t', 16, 16);
    const stamp = new TileStamp();
    stamp.addVariation(new TileLayer('v', 0, 0, 1, 1));
    expect(stamp.isEmpty()).toBe(true);
    const filled = new TileLayer('v2', 0, 0, 1, 1);
    filled.setCell(0, 0, new Cell(ts, 0));
    stamp.addVariation(filled);
    expect(stamp.isEmpty()).toBe(false);
  });

  it('randomVariation respects probability weights', () => {
    const ts = new Tileset('t', 16, 16);
    const v1 = new TileLayer('v1', 0, 0, 1, 1);
    v1.setCell(0, 0, new Cell(ts, 0));
    const v2 = new TileLayer('v2', 0, 0, 1, 1);
    v2.setCell(0, 0, new Cell(ts, 1));
    const stamp = new TileStamp();
    stamp.addVariation(v1, 1);
    stamp.addVariation(v2, 3);
    // First test: rng=0 → first; rng=0.99 → last
    expect(stamp.randomVariation(() => 0)?.layer).toBe(v1);
    expect(stamp.randomVariation(() => 0.99)?.layer).toBe(v2);
  });
});

describe('floodFillRegion', () => {
  it('fills a 4-connected component', () => {
    const ts = new Tileset('t', 16, 16);
    const layer = new TileLayer('l', 0, 0, 5, 5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        layer.setCell(x, y, new Cell(ts, 0));
      }
    }
    // Carve a barrier
    for (let x = 0; x < 5; x++) layer.setCell(x, 2, new Cell(ts, 1));

    const region = floodFillRegion(layer, { x: 2, y: 0 }, matchAny([layer.cellAt(2, 0)]));
    expect(region.cellCount()).toBe(10); // top 2 rows × 5 cols
    expect(region.contains({ x: 0, y: 2 })).toBe(false);
    expect(region.contains({ x: 4, y: 4 })).toBe(false);
  });

  it('returns empty when seed does not match', () => {
    const ts = new Tileset('t', 16, 16);
    const layer = new TileLayer('l', 0, 0, 3, 3);
    layer.setCell(0, 0, new Cell(ts, 0));
    const region = floodFillRegion(layer, { x: 0, y: 0 }, () => false);
    expect(region.isEmpty()).toBe(true);
  });

  it('regions union/translate work via TileRegion helpers', () => {
    const r = TileRegion.fromRect({ x: 0, y: 0, width: 2, height: 2 });
    const t = r.translated(10, 0);
    expect(t.contains({ x: 10, y: 0 })).toBe(true);
    expect(t.contains({ x: 0, y: 0 })).toBe(false);
  });
});
