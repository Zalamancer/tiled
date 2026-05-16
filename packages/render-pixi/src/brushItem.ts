// Port of `BrushItem` from src/tiled/brushitem.cpp.
//
// Renders a preview of the current stamp (a temporary `TileLayer`) on top of
// the live map. The PIXI implementation is a thin wrapper around the regular
// `TileLayerView` with an additional translucent fill behind the cells.

import {
  type Map as TiledMap,
  type TileLayer,
  TileRegion,
} from '@tiled-ts/core';
import { Container, Graphics, type ColorSource } from 'pixi.js';

import { TileLayerView } from './tileLayerView.js';
import type { TextureCache } from './textureCache.js';

export interface BrushItemOptions {
  map: TiledMap;
  textures: TextureCache;
  tintColor?: ColorSource;
}

export class BrushItem extends Container {
  private readonly highlight = new Graphics();
  private layerView: TileLayerView | null = null;
  private region: TileRegion = new TileRegion();
  private highlightColor: ColorSource;

  constructor(private readonly opts: BrushItemOptions) {
    super();
    this.label = 'BrushItem';
    this.eventMode = 'none';
    this.highlightColor = opts.tintColor ?? 0x00ffff;
    this.addChild(this.highlight);
  }

  /** Replace the stamp preview. Pass `null` to clear it. */
  setStamp(stamp: TileLayer | null): void {
    if (this.layerView) {
      this.removeChild(this.layerView);
      this.layerView.destroy();
      this.layerView = null;
    }
    if (stamp) {
      this.layerView = new TileLayerView(stamp, this.opts.map, this.opts.textures);
      this.addChild(this.layerView);
      this.layerView.refresh();
      this.layerView.alpha = 0.7;
    }
  }

  /** Override the hover/affected region. */
  setRegion(region: TileRegion): void {
    this.region = region;
    this.redrawHighlight();
  }

  /** Set the stamp origin in tile coordinates. */
  setTilePosition(tx: number, ty: number): void {
    this.position.set(tx * this.opts.map.tileWidth, ty * this.opts.map.tileHeight);
  }

  private redrawHighlight(): void {
    this.highlight.clear();
    if (this.region.isEmpty()) return;
    const tw = this.opts.map.tileWidth;
    const th = this.opts.map.tileHeight;
    const stroke = { color: this.highlightColor, width: 1, alpha: 0.9 };
    const fill = { color: this.highlightColor, alpha: 0.18 };
    for (const r of this.region.rects()) {
      this.highlight
        .rect(r.x * tw, r.y * th, r.width * tw, r.height * th)
        .fill(fill)
        .stroke(stroke);
    }
  }
}
