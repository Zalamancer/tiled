// PIXI v8 view for a `TileLayer`. Allocates one `Sprite` per visible cell and
// uses a per-screen viewport rect for culling. Layers larger than the viewport
// only spawn sprites for what's currently on-screen, which keeps draw counts
// in line with what PixiJS can batch (a few thousand per frame).

import {
  type Cell,
  type Map as TiledMap,
  type TileLayer,
  BlendMode,
} from '@tiled-ts/core';
import { Container, Sprite, Texture, type ColorSource } from 'pixi.js';

import { tileTransformFor } from './tileTransform.js';
import { TextureCache } from './textureCache.js';

export interface TileLayerViewOptions {
  /** Inclusive viewport rect in *pixel* coordinates of the map. Defaults to the whole map. */
  exposed?: { x: number; y: number; width: number; height: number };
}

export class TileLayerView extends Container {
  /** Pool of recyclable sprites — keyed by `y*width+x`. */
  private pool = new Map<number, Sprite>();

  constructor(
    public readonly layer: TileLayer,
    public readonly map: TiledMap,
    private readonly textures: TextureCache,
  ) {
    super();
    this.label = `TileLayerView(${layer.name})`;
    this.alpha = layer.opacity;
    this.visible = layer.visible;
    this.position.set(
      layer.x * map.tileWidth + layer.offset.x,
      layer.y * map.tileHeight + layer.offset.y,
    );
    this.blendMode = blendModeToPixi(layer.blendMode);
    this.tint = layer.effectiveTintColor() as ColorSource;
  }

  /** Re-issue draw commands for an updated viewport. Idempotent. */
  refresh(opts: TileLayerViewOptions = {}): void {
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const exposed = opts.exposed ?? {
      x: 0,
      y: 0,
      width: this.map.width * tw,
      height: this.map.height * th,
    };

    const startX = Math.max(0, Math.floor(exposed.x / tw));
    const startY = Math.max(0, Math.floor(exposed.y / th));
    const endX = Math.min(this.layer.width, Math.ceil((exposed.x + exposed.width) / tw));
    const endY = Math.min(this.layer.height, Math.ceil((exposed.y + exposed.height) / th));

    const stillInUse = new Set<number>();

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = this.layer.cellAt(x, y);
        if (cell.isEmpty()) continue;

        const key = y * this.layer.width + x;
        stillInUse.add(key);
        let sprite = this.pool.get(key);
        if (!sprite) {
          sprite = new Sprite();
          sprite.anchor.set(0.5, 0.5);
          this.addChild(sprite);
          this.pool.set(key, sprite);
        }
        this.applyCell(sprite, cell, x, y);
      }
    }

    // Recycle sprites that fell out of the viewport.
    for (const [key, sprite] of this.pool) {
      if (!stillInUse.has(key)) {
        this.removeChild(sprite);
        sprite.destroy({ texture: false });
        this.pool.delete(key);
      }
    }
  }

  /** Updates per-cell visuals; called from `refresh` and also after animations. */
  applyCell(sprite: Sprite, cell: Cell, x: number, y: number): void {
    const tile = cell.tile()?.currentFrameTile();
    if (!tile || !cell.tileset) return;
    const texture = this.textures.textureForTileId(cell.tileset, tile.id);
    sprite.texture = texture || Texture.EMPTY;

    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const transform = tileTransformFor(cell, { width: tw, height: th });
    sprite.position.set(x * tw + transform.centerX, y * th + transform.centerY);
    sprite.rotation = transform.rotation;
    sprite.scale.set(transform.scaleX, transform.scaleY);
  }

  /** Re-issue every existing sprite (no culling change). Used after animation. */
  rerenderAnimated(): void {
    for (const [key, sprite] of this.pool) {
      const x = key % this.layer.width;
      const y = Math.floor(key / this.layer.width);
      const cell = this.layer.cellAt(x, y);
      if (!cell.isEmpty()) this.applyCell(sprite, cell, x, y);
    }
  }

  override destroy(): void {
    for (const sprite of this.pool.values()) sprite.destroy({ texture: false });
    this.pool.clear();
    super.destroy({ children: true });
  }
}

function blendModeToPixi(b: BlendMode): 'normal' | 'add' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' {
  switch (b) {
    case BlendMode.Add:
      return 'add';
    case BlendMode.Multiply:
      return 'multiply';
    case BlendMode.Screen:
      return 'screen';
    case BlendMode.Overlay:
      return 'overlay';
    case BlendMode.Darken:
      return 'darken';
    case BlendMode.Lighten:
      return 'lighten';
    case BlendMode.ColorDodge:
      return 'color-dodge';
    case BlendMode.ColorBurn:
      return 'color-burn';
    case BlendMode.HardLight:
      return 'hard-light';
    case BlendMode.SoftLight:
      return 'soft-light';
    case BlendMode.Difference:
      return 'difference';
    case BlendMode.Exclusion:
      return 'exclusion';
    default:
      return 'normal';
  }
}
