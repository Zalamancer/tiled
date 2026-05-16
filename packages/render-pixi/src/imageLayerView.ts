// PIXI view for an `ImageLayer`. Supports the `repeatx` / `repeaty` modes via
// `TilingSprite`, falling back to a plain `Sprite` when neither is set.

import type { ImageLayer, Map as TiledMap } from '@tiled-ts/core';
import { Container, Sprite, TilingSprite, Texture, type TextureSource } from 'pixi.js';

import type { ImageLoader } from './textureCache.js';

export class ImageLayerView extends Container {
  private inner: Sprite | TilingSprite | null = null;

  constructor(
    public readonly layer: ImageLayer,
    public readonly map: TiledMap,
    private readonly loader: ImageLoader,
  ) {
    super();
    this.label = `ImageLayerView(${layer.name})`;
    this.alpha = layer.opacity;
    this.visible = layer.visible;
    this.position.set(
      layer.x * map.tileWidth + layer.offset.x,
      layer.y * map.tileHeight + layer.offset.y,
    );
  }

  async load(): Promise<void> {
    if (!this.layer.imageSource) return;
    const src: TextureSource = await this.loader(this.layer.imageSource);
    const texture = new Texture({ source: src });
    if (this.layer.repeatX || this.layer.repeatY) {
      const ts = new TilingSprite({ texture, width: src.width, height: src.height });
      ts.tilePosition.set(0, 0);
      this.inner = ts;
    } else {
      this.inner = new Sprite(texture);
    }
    this.addChild(this.inner);
  }

  setRepeatViewport(width: number, height: number): void {
    if (this.inner && this.inner instanceof TilingSprite) {
      this.inner.width = width;
      this.inner.height = height;
    }
  }
}
