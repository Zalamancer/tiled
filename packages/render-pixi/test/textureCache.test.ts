import { describe, expect, it, vi } from 'vitest';
import { Tileset } from '@tiled-ts/core';

import { TextureCache, type ImageLoader } from '../src/textureCache.js';

// Fake `TextureSource` shape — the cache only reads `.width`/`.height`.
function fakeSource(width: number, height: number) {
  return { width, height, label: 'fake' } as unknown as Parameters<ImageLoader>[0] extends string ? never : never;
}

describe('TextureCache', () => {
  it('slices an image-based tileset into one texture per tile', async () => {
    const ts = new Tileset('terrain', 16, 16);
    ts.imageReference.source = 'fake://terrain.png';

    const loader: ImageLoader = vi.fn(async () =>
      ({ width: 64, height: 32, label: 'fake' }) as never,
    );
    const cache = new TextureCache(loader);
    await cache.load(ts);

    // 64x32 / 16x16 = 4 cols × 2 rows = 8 textures
    expect(Array.from(cache.entries())).toHaveLength(8);
    expect(loader).toHaveBeenCalledTimes(1);

    // Idempotent
    await cache.load(ts);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(ts.columnCount).toBe(4);
  });

  it('loads per-tile images for collection-based tilesets', async () => {
    const ts = new Tileset('coll', 16, 16);
    const t1 = ts.findOrCreateTile(0);
    const t2 = ts.findOrCreateTile(1);
    t1.imageSource = 'a.png';
    t2.imageSource = 'b.png';
    // isCollection is true when ts.imageReference.source is empty

    const loader: ImageLoader = vi.fn(async (src: string) =>
      ({ width: 16, height: 16, label: src }) as never,
    );
    const cache = new TextureCache(loader);
    await cache.load(ts);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(Array.from(cache.entries())).toHaveLength(2);
  });

  it('returns Texture.EMPTY for unknown tiles', () => {
    const ts = new Tileset('x', 16, 16);
    const cache = new TextureCache(async () => ({ width: 0, height: 0 }) as never);
    const tex = cache.textureForTileId(ts, 999);
    expect(tex.label).toBe('EMPTY');
  });
});
