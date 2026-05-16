// Loads tileset images and slices them into per-tile `Texture` references.
//
// In Tiled's C++, this is `Tileset::loadFromImage` plus `Tile::setImage`. The
// web port keeps the data-model (Tile metadata) inside `@tiled-ts/core` and
// performs all GPU-facing texture work here.

import {
  LoadingStatus,
  type Tile,
  type Tileset,
} from '@tiled-ts/core';
import { Texture, Rectangle, ImageSource, type TextureSource } from 'pixi.js';

/**
 * Resolves a `Tileset.imageSource` (URL-or-path string) into a TextureSource.
 * Provided by the caller so that the renderer is unopinionated about asset
 * pipelines — works with Vite-bundled URLs, blob URLs, `Assets.load`, etc.
 */
export type ImageLoader = (src: string) => Promise<TextureSource>;

/**
 * Caches per-tileset base textures and per-tile sliced textures. Idempotent
 * for repeated calls with the same Tileset — promises are memoised.
 */
export class TextureCache {
  private base = new Map<Tileset, TextureSource>();
  private tiles = new Map<number, Map<number, Texture>>();
  private loading = new Map<Tileset, Promise<void>>();

  constructor(private readonly loader: ImageLoader) {}

  /** Force-load a single tileset. Subsequent calls re-use the cached source. */
  async load(tileset: Tileset): Promise<void> {
    const existing = this.loading.get(tileset);
    if (existing) return existing;

    const p = (async () => {
      if (this.base.has(tileset)) return;

      // Image-collection tileset: load per-tile images instead.
      if (tileset.isCollection) {
        for (const tile of tileset.tiles) {
          if (!tile.imageSource) continue;
          const src = await this.loader(tile.imageSource);
          this.setTileTexture(tileset, tile.id, new Texture({ source: src }));
        }
        tileset.setStatus(LoadingStatus.LoadingReady);
        return;
      }

      // Image-based tileset: slice the master texture by the tileset grid.
      if (!tileset.imageSource) {
        tileset.setStatus(LoadingStatus.LoadingError);
        return;
      }
      const src = await this.loader(tileset.imageSource);
      this.base.set(tileset, src);
      tileset.imageReference.size = { width: src.width, height: src.height };
      tileset.setImageStatus(LoadingStatus.LoadingReady);
      this.sliceFromImage(tileset, src);
      tileset.setStatus(LoadingStatus.LoadingReady);
    })().catch((err) => {
      tileset.setStatus(LoadingStatus.LoadingError);
      throw err;
    });

    this.loading.set(tileset, p);
    return p;
  }

  /** Synchronously look up a tile's texture, returning Texture.EMPTY if missing. */
  textureFor(tile: Tile): Texture {
    return this.tiles.get(tileset_id(tile.tileset))?.get(tile.id) ?? Texture.EMPTY;
  }

  textureForTileId(tileset: Tileset, tileId: number): Texture {
    return this.tiles.get(tileset_id(tileset))?.get(tileId) ?? Texture.EMPTY;
  }

  /** Inject a pre-computed texture (useful for tests or custom pipelines). */
  setTileTexture(tileset: Tileset, tileId: number, tex: Texture): void {
    let inner = this.tiles.get(tileset_id(tileset));
    if (!inner) {
      inner = new Map();
      this.tiles.set(tileset_id(tileset), inner);
    }
    inner.set(tileId, tex);
  }

  /** Drop every cached texture (does not call `destroy`). */
  clear(): void {
    this.base.clear();
    this.tiles.clear();
    this.loading.clear();
  }

  /** Walk every (tilesetId, tileId) entry — used by tests/diagnostics. */
  *entries(): IterableIterator<[number, number, Texture]> {
    for (const [tsId, inner] of this.tiles) {
      for (const [tileId, tex] of inner) yield [tsId, tileId, tex];
    }
  }

  private sliceFromImage(tileset: Tileset, src: TextureSource): void {
    const tw = tileset.tileWidth;
    const th = tileset.tileHeight;
    if (tw <= 0 || th <= 0) return;
    const cols = tileset.columnCountForWidth(src.width);
    const rows = tileset.rowCountForHeight(src.height);
    tileset.setColumnCount(cols);
    let id = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const frame = new Rectangle(
          tileset.margin + col * (tw + tileset.tileSpacing),
          tileset.margin + row * (th + tileset.tileSpacing),
          tw,
          th,
        );
        const tile = tileset.findOrCreateTile(id);
        tile.imageRect = { x: frame.x, y: frame.y, width: tw, height: th };
        const tex = new Texture({ source: src, frame });
        this.setTileTexture(tileset, id, tex);
        id += 1;
      }
    }
  }
}

let _tilesetIdSeq = 1;
const _tilesetIds = new WeakMap<Tileset, number>();
function tileset_id(t: Tileset | null): number {
  if (!t) return 0;
  let id = _tilesetIds.get(t);
  if (id === undefined) {
    id = _tilesetIdSeq++;
    _tilesetIds.set(t, id);
  }
  return id;
}

/** Re-export so callers can type their loaders. */
export { Texture, Rectangle, ImageSource };
