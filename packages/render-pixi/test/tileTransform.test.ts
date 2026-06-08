import { describe, expect, it } from 'vitest';
import { Cell, Tileset } from '@tiled-ts/core';

import { tileTransformFor } from '../src/tileTransform.js';

const size = { width: 32, height: 32 };

function withFlags(h: boolean, v: boolean, d: boolean): Cell {
  const ts = new Tileset('t', 32, 32);
  const c = new Cell(ts, 0);
  c.setFlippedHorizontally(h);
  c.setFlippedVertically(v);
  c.setFlippedAntiDiagonally(d);
  return c;
}

describe('tileTransformFor — 8 flip combinations', () => {
  it('identity', () => {
    const t = tileTransformFor(withFlags(false, false, false), size);
    expect(t.rotation).toBe(0);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it('H only', () => {
    const t = tileTransformFor(withFlags(true, false, false), size);
    expect(t.rotation).toBe(0);
    expect(t.scaleX).toBe(-1);
    expect(t.scaleY).toBe(1);
  });

  it('V only', () => {
    const t = tileTransformFor(withFlags(false, true, false), size);
    expect(t.rotation).toBe(0);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(-1);
  });

  it('H + V (180° equivalent)', () => {
    const t = tileTransformFor(withFlags(true, true, false), size);
    expect(t.rotation).toBe(0);
    expect(t.scaleX).toBe(-1);
    expect(t.scaleY).toBe(-1);
  });

  it('D only: rotation = 90° CW, axes swapped', () => {
    const t = tileTransformFor(withFlags(false, false, true), size);
    expect(t.rotation).toBeCloseTo(Math.PI / 2);
    // After D: newH = V = false → scaleX = 1; newV = !H = !false = true → scaleY = -1
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(-1);
  });

  it('H + D (= rotate 90° CW)', () => {
    const t = tileTransformFor(withFlags(true, false, true), size);
    expect(t.rotation).toBeCloseTo(Math.PI / 2);
    // newH = V = false → scaleX = 1; newV = !H = false → scaleY = 1
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it('V + D (= rotate 90° CCW equivalent)', () => {
    const t = tileTransformFor(withFlags(false, true, true), size);
    expect(t.rotation).toBeCloseTo(Math.PI / 2);
    // newH = V = true → scaleX = -1; newV = !H = true → scaleY = -1
    expect(t.scaleX).toBe(-1);
    expect(t.scaleY).toBe(-1);
  });

  it('all flags', () => {
    const t = tileTransformFor(withFlags(true, true, true), size);
    expect(t.rotation).toBeCloseTo(Math.PI / 2);
    expect(t.scaleX).toBe(-1);
    expect(t.scaleY).toBe(1);
  });

  it('non-square tile adds halfDiff compensation when D is set', () => {
    const cell = withFlags(false, false, true);
    const t = tileTransformFor(cell, { width: 32, height: 64 });
    // Bottom-left-anchored centre = (+w/2, -h/2). halfDiff = (h-w)/2 = 16.
    expect(t.centerX).toBe(32 / 2 + 16);
    expect(t.centerY).toBe(-64 / 2 + 16);
  });

  it('non-square tile without D uses bottom-left centre offset', () => {
    const cell = withFlags(true, false, false);
    const t = tileTransformFor(cell, { width: 32, height: 64 });
    expect(t.centerX).toBe(16);
    expect(t.centerY).toBe(-32);
  });
});
