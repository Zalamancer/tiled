// Port of libtiled/grouplayer.h+cpp.

import { Layer, LayerTypeFlag } from './layer.js';
import type { Map as TiledMap } from './map.js';
import type { Tileset } from './tileset.js';

export class GroupLayer extends Layer {
  layers: Layer[] = [];

  constructor(name = '', x = 0, y = 0) {
    super(LayerTypeFlag.GroupLayerType, name, x, y);
  }

  layerCount(): number {
    return this.layers.length;
  }
  layerAt(index: number): Layer | undefined {
    return this.layers[index];
  }

  addLayer(layer: Layer): void {
    this.adoptLayer(layer);
    this.layers.push(layer);
  }

  insertLayer(index: number, layer: Layer): void {
    this.adoptLayer(layer);
    this.layers.splice(index, 0, layer);
  }

  takeLayerAt(index: number): Layer | undefined {
    const [removed] = this.layers.splice(index, 1);
    if (removed) {
      removed.parentLayer = undefined;
      removed.map = undefined;
    }
    return removed;
  }

  /* ─── Layer overrides ─── */

  override isEmpty(): boolean {
    return this.layers.length === 0;
  }

  override usedTilesets(): Set<Tileset> {
    const out = new Set<Tileset>();
    for (const l of this.layers) for (const ts of l.usedTilesets()) out.add(ts);
    return out;
  }

  override referencesTileset(tileset: Tileset): boolean {
    return this.layers.some((l) => l.referencesTileset(tileset));
  }

  override replaceReferencesToTileset(oldTileset: Tileset, newTileset: Tileset): void {
    for (const l of this.layers) l.replaceReferencesToTileset(oldTileset, newTileset);
  }

  override canMergeWith(_other: Layer): boolean {
    return false;
  }

  override mergedWith(_other: Layer): Layer {
    throw new Error('GroupLayer cannot merge with other layers');
  }

  override clone(): GroupLayer {
    const c = new GroupLayer(this.name, this.x, this.y);
    this.initializeClone(c);
    for (const child of this.layers) c.addLayer(child.clone());
    return c;
  }

  /** @internal — called from Map.addLayer / TakeLayer to push parent down. */
  setMapInternal(map: TiledMap | undefined): void {
    this.map = map;
    for (const l of this.layers) {
      l.map = map;
      if (l.isGroupLayer()) (l as GroupLayer).setMapInternal(map);
    }
  }

  private adoptLayer(layer: Layer): void {
    layer.parentLayer = this;
    layer.map = this.map;
    if (layer.isGroupLayer()) (layer as GroupLayer).setMapInternal(this.map);
  }
}
