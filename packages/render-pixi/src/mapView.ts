// PIXI v8 map view orchestrator.
//
// `MapView` owns a `pixi.js Application`, the layer views, the texture cache
// and the tile-animation driver. The host (React editor, viewer app, CLI) is
// responsible for mounting the canvas and forwarding viewport changes via
// `setViewport()`.

import {
  type Layer,
  type Map as TiledMap,
  type Tileset,
} from '@tiled-ts/core';
import { Application, Container, type ColorSource } from 'pixi.js';

import { TextureCache, type ImageLoader } from './textureCache.js';
import { TileLayerView } from './tileLayerView.js';
import { ObjectGroupView } from './objectGroupView.js';
import { ImageLayerView } from './imageLayerView.js';
import { TileAnimationDriver } from './tileAnimationDriver.js';

export interface MapViewOptions {
  map: TiledMap;
  loader: ImageLoader;
  backgroundColor?: ColorSource;
  /** When true, the animation driver is started after `init`. Default: true. */
  autoStartAnimations?: boolean;
}

export class MapView {
  readonly app: Application;
  readonly world: Container;
  readonly textures: TextureCache;
  readonly animations: TileAnimationDriver;

  private layerViews: Array<{ layer: Layer; view: Container }> = [];
  private viewport = { x: 0, y: 0, width: 0, height: 0 };
  private cameraScale = 1;
  private bound = false;

  constructor(private readonly opts: MapViewOptions) {
    this.app = new Application();
    this.world = new Container();
    this.world.label = 'MapWorld';
    this.textures = new TextureCache(opts.loader);
    this.animations = new TileAnimationDriver();
    this.animations.addListener({
      onTilesAdvanced: () => this.refreshAnimatedLayers(),
    });
  }

  async init(canvas?: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      backgroundColor: this.opts.backgroundColor ?? this.opts.map.backgroundColor ?? 0x222222,
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      autoDensity: true,
      antialias: false,
    });
    this.app.stage.addChild(this.world);

    for (const ts of this.opts.map.tilesets) {
      await this.textures.load(ts);
      this.animations.trackTileset(ts);
    }

    for (const layer of this.opts.map.layers) {
      await this.addLayerView(layer);
    }

    if (this.opts.autoStartAnimations !== false) this.animations.start();
    this.bound = true;
    this.refresh();
  }

  /** Replace the current viewport rect (map-pixel coordinates). */
  setViewport(x: number, y: number, width: number, height: number): void {
    this.viewport = { x, y, width, height };
    this.applyCameraTransform();
    this.refreshAll();
  }

  /** Pan to (centreX, centreY) in map-pixel coordinates. */
  setCenter(cx: number, cy: number): void {
    const half = { x: this.viewport.width / 2, y: this.viewport.height / 2 };
    this.setViewport(cx - half.x, cy - half.y, this.viewport.width, this.viewport.height);
  }

  /** Set scale around the centre of the viewport. */
  setScale(scale: number): void {
    this.cameraScale = scale;
    this.world.scale.set(scale);
    this.applyCameraTransform();
    this.refreshAll();
  }

  /** Reload a single tileset (e.g. after the user changes its image). */
  async reloadTileset(ts: Tileset): Promise<void> {
    this.textures.clear();
    for (const t of this.opts.map.tilesets) await this.textures.load(t);
    this.refreshAll();
  }

  /** Re-sync layer state and redraw existing layer views after map mutations. */
  refresh(): void {
    this.syncLayerViews();
    this.refreshAll();
  }

  destroy(): void {
    this.animations.destroy();
    for (const { view } of this.layerViews) {
      if (!view.parent || view.parent === this.world) view.destroy({ children: true });
    }
    this.layerViews = [];
    this.app.destroy(true, { children: true });
    this.bound = false;
  }

  /* ─── internals ─── */

  private async addLayerView(layer: Layer, parent: Container = this.world): Promise<void> {
    let view: Container | undefined;
    if (layer.isTileLayer()) {
      view = new TileLayerView(layer, this.opts.map, this.textures);
    } else if (layer.isObjectGroup()) {
      view = new ObjectGroupView(layer, this.opts.map, this.textures);
    } else if (layer.isImageLayer()) {
      const iv = new ImageLayerView(layer, this.opts.map, this.opts.loader);
      await iv.load();
      view = iv;
    } else if (layer.isGroupLayer()) {
      const group = new Container();
      group.label = `GroupLayerView(${layer.name})`;
      group.alpha = layer.opacity;
      group.visible = layer.visible;
      parent.addChild(group);
      this.layerViews.push({ layer, view: group });
      for (const child of layer.layers) await this.addLayerView(child, group);
      return;
    }
    if (view) {
      parent.addChild(view);
      this.layerViews.push({ layer, view });
    }
  }

  private syncLayerViews(): void {
    for (const { layer, view } of this.layerViews) {
      if (view instanceof TileLayerView) view.syncLayerState();
      else if (view instanceof ObjectGroupView) view.syncLayerState();
      else if (view instanceof ImageLayerView) view.syncLayerState();
      else if (layer.isGroupLayer()) {
        view.alpha = layer.opacity;
        view.visible = layer.visible;
        view.position.set(
          layer.x * this.opts.map.tileWidth + layer.offset.x,
          layer.y * this.opts.map.tileHeight + layer.offset.y,
        );
      }
    }
  }

  private applyCameraTransform(): void {
    this.world.position.set(-this.viewport.x * this.cameraScale, -this.viewport.y * this.cameraScale);
  }

  private refreshAll(): void {
    if (!this.bound) return;
    // Convert screen viewport into world-pixel coordinates.
    const worldViewport = {
      x: -this.world.position.x / this.cameraScale,
      y: -this.world.position.y / this.cameraScale,
      width: (this.viewport.width || this.opts.map.width * this.opts.map.tileWidth) / this.cameraScale,
      height: (this.viewport.height || this.opts.map.height * this.opts.map.tileHeight) / this.cameraScale,
    };
    for (const { view: v } of this.layerViews) {
      if (v instanceof TileLayerView) v.refresh({ exposed: worldViewport });
      else if (v instanceof ObjectGroupView) v.refresh();
    }
  }

  private refreshAnimatedLayers(): void {
    for (const { view: v } of this.layerViews) if (v instanceof TileLayerView) v.rerenderAnimated();
  }
}
