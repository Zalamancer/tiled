// Port of libtiled/minimaprenderer.h+cpp.
//
// Renders a downsampled snapshot of the map to a `RenderTexture`. Cheap to
// call repeatedly; intended for the minimap dock and project thumbnails.

import type { Map as TiledMap } from '@tiled-ts/core';
import { type Application, Container, RenderTexture, Texture } from 'pixi.js';

import { TextureCache, type ImageLoader } from './textureCache.js';
import { TileLayerView } from './tileLayerView.js';

export enum MinimapFlag {
  DrawMapObjects = 0x01,
  DrawTileLayers = 0x02,
  DrawImageLayers = 0x04,
  IgnoreInvisibleLayer = 0x08,
  DrawGrid = 0x10,
  DrawBackground = 0x20,
  SmoothPixmapTransform = 0x40,
  IncludeOverhangingTiles = 0x80,
  IgnoreOffsetsAndImages = 0x100,
}

export interface MinimapOptions {
  size: { width: number; height: number };
  flags?: number;
}

export class MinimapRenderer {
  constructor(
    private readonly app: Application,
    private readonly map: TiledMap,
    private readonly textures: TextureCache,
    private readonly loader: ImageLoader,
  ) {}

  /** Render the map to a `RenderTexture` of `size`. Disposed by caller. */
  render(opts: MinimapOptions): Texture {
    const tex = RenderTexture.create({ width: opts.size.width, height: opts.size.height });
    const root = new Container();
    const flags = opts.flags ?? MinimapFlag.DrawTileLayers | MinimapFlag.DrawMapObjects;
    const mapWidthPx = this.map.width * this.map.tileWidth;
    const mapHeightPx = this.map.height * this.map.tileHeight;
    const scale = Math.min(opts.size.width / mapWidthPx, opts.size.height / mapHeightPx);
    root.scale.set(scale, scale);

    for (const layer of this.map.layers) {
      if ((flags & MinimapFlag.IgnoreInvisibleLayer) && !layer.visible) continue;
      if (layer.isTileLayer() && flags & MinimapFlag.DrawTileLayers) {
        const v = new TileLayerView(layer, this.map, this.textures);
        v.refresh();
        root.addChild(v);
      }
    }

    this.app.renderer.render({ container: root, target: tex });
    root.destroy({ children: true });
    return tex;
  }
}
