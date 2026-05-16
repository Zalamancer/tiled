import { describe, expect, it, vi } from 'vitest';

import { Tileset } from '@tiled-ts/core';
import { TileAnimationDriver } from '../src/tileAnimationDriver.js';

describe('TileAnimationDriver', () => {
  it('advances animated tiles and fires onTilesAdvanced', () => {
    const ts = new Tileset('t', 16, 16);
    const a = ts.findOrCreateTile(0);
    const b = ts.findOrCreateTile(1);
    a.setFrames([
      { tileId: 0, duration: 100 },
      { tileId: 1, duration: 100 },
    ]);

    const driver = new TileAnimationDriver();
    driver.trackTileset(ts);

    const spy = vi.fn();
    driver.addListener({ onTilesAdvanced: spy });

    // Step under 100 ms: no change.
    expect(driver.tick(50)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(a.currentFrameTile()).toBe(a);

    // Step past 100 ms boundary: frame index moves to 1 (tileId 1).
    expect(driver.tick(80)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.currentFrameTile()).toBe(b);

    driver.destroy();
  });

  it('non-animated tilesets do not trigger the listener', () => {
    const ts = new Tileset('t', 16, 16);
    ts.findOrCreateTile(0); // no frames
    const driver = new TileAnimationDriver();
    driver.trackTileset(ts);
    const spy = vi.fn();
    driver.addListener({ onTilesAdvanced: spy });
    expect(driver.tick(1000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    driver.destroy();
  });
});
