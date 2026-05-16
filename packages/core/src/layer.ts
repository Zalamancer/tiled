// Port of libtiled/layer.h+cpp.

import { TiledObject, ObjectTypeId } from './object.js';
import { type ColorString, type Point } from './types.js';
import { BlendMode } from './tiled.js';
import { cloneProperties } from './properties.js';

import type { Map as TiledMap } from './map.js';
import type { GroupLayer } from './grouplayer.js';
import type { TileLayer } from './tilelayer.js';
import type { ObjectGroup } from './objectgroup.js';
import type { ImageLayer } from './imagelayer.js';
import type { Tileset } from './tileset.js';

export enum LayerTypeFlag {
  TileLayerType = 0x01,
  ObjectGroupType = 0x02,
  ImageLayerType = 0x04,
  GroupLayerType = 0x08,
  AnyLayerType = 0xff,
}

export abstract class Layer extends TiledObject {
  readonly layerType: LayerTypeFlag;
  name: string;
  id = 0;
  x: number;
  y: number;
  offset: Point = { x: 0, y: 0 };
  parallaxFactor: Point = { x: 1, y: 1 };
  blendMode: BlendMode = BlendMode.Normal;
  opacity = 1;
  /** undefined means "inherit from parent / no tint". Mirrors `QColor()` invalid. */
  tintColor: ColorString | undefined = undefined;
  visible = true;
  locked = false;

  /** @internal — populated by `Map.addLayer` / `GroupLayer.addLayer`. */
  map: TiledMap | undefined = undefined;
  /** @internal — populated when added to a `GroupLayer`. */
  parentLayer: GroupLayer | undefined = undefined;

  protected constructor(layerType: LayerTypeFlag, name: string, x = 0, y = 0) {
    super(ObjectTypeId.LayerType);
    this.layerType = layerType;
    this.name = name;
    this.x = x;
    this.y = y;
  }

  /** Effective opacity = product of self and all ancestor opacities. */
  effectiveOpacity(): number {
    let o = this.opacity;
    let layer: Layer | undefined = this.parentLayer;
    while (layer) {
      o *= layer.opacity;
      layer = layer.parentLayer;
    }
    return o;
  }

  /**
   * Effective tint color = component-wise multiply of self with all ancestor
   * tints (treated as `#FFFFFF` when unset). Returned in `#AARRGGBB`/#RRGGBB
   * form, mirroring `Tiled::colorToString`.
   */
  effectiveTintColor(): ColorString {
    let [r, g, b, a] = parseColor(this.tintColor ?? '#ffffffff');
    let layer: Layer | undefined = this.parentLayer;
    while (layer) {
      if (layer.tintColor) {
        const [lr, lg, lb, la] = parseColor(layer.tintColor);
        r = Math.round((r * lr) / 255);
        g = Math.round((g * lg) / 255);
        b = Math.round((b * lb) / 255);
        a = Math.round((a * la) / 255);
      }
      layer = layer.parentLayer;
    }
    return formatColor(r, g, b, a);
  }

  /** A visible layer is still hidden if any ancestor is invisible. */
  isHidden(): boolean {
    let layer: Layer | undefined = this;
    while (layer && layer.visible) layer = layer.parentLayer;
    return Boolean(layer);
  }

  /** Effective lock status: true unless self or any ancestor is locked. */
  isUnlocked(): boolean {
    let layer: Layer | undefined = this;
    while (layer && !layer.locked) layer = layer.parentLayer;
    return !layer;
  }

  isParentOrSelf(candidate: Layer | undefined): boolean {
    let layer: Layer | undefined = this;
    while (layer !== candidate && layer?.parentLayer) layer = layer.parentLayer;
    return layer === candidate;
  }

  depth(): number {
    let d = 0;
    let p = this.parentLayer;
    while (p) {
      d += 1;
      p = p.parentLayer;
    }
    return d;
  }

  siblings(): Layer[] {
    if (this.parentLayer) return this.parentLayer.layers;
    if (this.map) return this.map.layers;
    return [];
  }

  siblingIndex(): number {
    return this.siblings().indexOf(this);
  }

  totalOffset(): Point {
    let { x, y } = this.offset;
    let layer: Layer | undefined = this.parentLayer;
    while (layer) {
      x += layer.offset.x;
      y += layer.offset.y;
      layer = layer.parentLayer;
    }
    return { x, y };
  }

  effectiveParallaxFactor(): Point {
    let { x, y } = this.parallaxFactor;
    let layer: Layer | undefined = this.parentLayer;
    while (layer) {
      x *= layer.parallaxFactor.x;
      y *= layer.parallaxFactor.y;
      layer = layer.parentLayer;
    }
    return { x, y };
  }

  /** Subclasses must implement. */
  abstract isEmpty(): boolean;
  abstract usedTilesets(): Set<Tileset>;
  abstract referencesTileset(tileset: Tileset): boolean;
  abstract replaceReferencesToTileset(oldTileset: Tileset, newTileset: Tileset): void;
  abstract canMergeWith(other: Layer): boolean;
  abstract mergedWith(other: Layer): Layer;
  abstract clone(): Layer;

  isTileLayer(): this is TileLayer {
    return this.layerType === LayerTypeFlag.TileLayerType;
  }
  isObjectGroup(): this is ObjectGroup {
    return this.layerType === LayerTypeFlag.ObjectGroupType;
  }
  isImageLayer(): this is ImageLayer {
    return this.layerType === LayerTypeFlag.ImageLayerType;
  }
  isGroupLayer(): this is GroupLayer {
    return this.layerType === LayerTypeFlag.GroupLayerType;
  }

  canMergeDown(): boolean {
    const i = this.siblingIndex();
    if (i < 1) return false;
    const lower = this.siblings()[i - 1]!;
    return lower.canMergeWith(this);
  }

  /**
   * Helper for subclasses to copy non-geometry properties from `this` onto a
   * fresh clone instance.
   */
  protected initializeClone<T extends Layer>(clone: T): T {
    clone.setClassName(this.className);
    clone.id = this.id;
    clone.offset = { ...this.offset };
    clone.parallaxFactor = { ...this.parallaxFactor };
    clone.opacity = this.opacity;
    clone.blendMode = this.blendMode;
    clone.tintColor = this.tintColor;
    clone.visible = this.visible;
    clone.locked = this.locked;
    clone.setProperties(cloneProperties(this.properties));
    return clone;
  }
}

/* ───────────────────────── color helpers ──────────────────────────────── */

function parseColor(c: ColorString): [number, number, number, number] {
  const m = c.replace('#', '');
  if (m.length === 6) {
    return [int2(m, 0), int2(m, 2), int2(m, 4), 255];
  }
  if (m.length === 8) {
    // Tiled writes #AARRGGBB
    return [int2(m, 2), int2(m, 4), int2(m, 6), int2(m, 0)];
  }
  return [255, 255, 255, 255];
}

function int2(s: string, i: number): number {
  return parseInt(s.substring(i, i + 2), 16);
}

function formatColor(r: number, g: number, b: number, a: number): ColorString {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  if (a !== 255) return `#${hex(a)}${hex(r)}${hex(g)}${hex(b)}`;
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/* ─────────────────────────── LayerIterator ────────────────────────────── */

/**
 * Forward-only depth-first iterator over a map's layer tree, in *draw* order.
 * Group layers are visited *after* their children. Mirrors libtiled's
 * `LayerIterator` exactly so command code can be ported verbatim.
 */
export class LayerIterator {
  private mMap: TiledMap | undefined;
  private mCurrentLayer: Layer | undefined;
  private mSiblingIndex: number;
  private readonly mLayerTypes: number;

  constructor(mapOrStart: TiledMap | Layer | undefined, layerTypes = LayerTypeFlag.AnyLayerType) {
    if (mapOrStart && mapOrStart instanceof Layer) {
      this.mMap = mapOrStart.map;
      this.mCurrentLayer = mapOrStart;
      this.mSiblingIndex = mapOrStart.siblingIndex();
      this.mLayerTypes = LayerTypeFlag.AnyLayerType;
    } else {
      this.mMap = mapOrStart as TiledMap | undefined;
      this.mCurrentLayer = undefined;
      this.mSiblingIndex = -1;
      this.mLayerTypes = layerTypes;
    }
  }

  currentLayer(): Layer | undefined {
    return this.mCurrentLayer;
  }
  currentSiblingIndex(): number {
    return this.mSiblingIndex;
  }

  setCurrentLayer(layer: Layer | undefined): void {
    this.mCurrentLayer = layer;
    this.mSiblingIndex = layer ? layer.siblingIndex() : -1;
  }

  hasNextSibling(): boolean {
    if (!this.mCurrentLayer) return false;
    return this.mSiblingIndex + 1 < this.mCurrentLayer.siblings().length;
  }
  hasPreviousSibling(): boolean {
    return this.mSiblingIndex > 0;
  }
  hasParent(): boolean {
    return Boolean(this.mCurrentLayer?.parentLayer);
  }

  toFront(): void {
    this.mCurrentLayer = undefined;
    this.mSiblingIndex = -1;
  }
  toBack(): void {
    this.mCurrentLayer = undefined;
    this.mSiblingIndex = this.mMap ? this.mMap.layerCount() : 0;
  }

  next(): Layer | undefined {
    let layer: Layer | undefined = this.mCurrentLayer;
    let index = this.mSiblingIndex;

    do {
      index += 1;

      if (!layer) {
        if (this.mMap && index < this.mMap.layerCount()) {
          layer = this.mMap.layerAt(index);
        } else {
          layer = undefined;
          break;
        }
      } else {
        const siblings = layer.siblings();
        if (index === siblings.length) {
          layer = layer.parentLayer;
          index = layer ? layer.siblingIndex() : (this.mMap?.layerCount() ?? 0);
        } else {
          layer = siblings[index];
          while (layer && layer.isGroupLayer()) {
            const g = layer as GroupLayer;
            if (g.layerCount() > 0) {
              index = 0;
              layer = g.layerAt(0);
            } else {
              break;
            }
          }
        }
      }
    } while (layer && !(layer.layerType & this.mLayerTypes));

    this.mCurrentLayer = layer;
    this.mSiblingIndex = index;
    return layer;
  }

  previous(): Layer | undefined {
    let layer: Layer | undefined = this.mCurrentLayer;
    let index = this.mSiblingIndex;

    do {
      index -= 1;

      if (!layer) {
        if (this.mMap && index >= 0 && index < this.mMap.layerCount()) {
          layer = this.mMap.layerAt(index);
        } else {
          break;
        }
      } else {
        if (layer.isGroupLayer()) {
          const g = layer as GroupLayer;
          if (g.layerCount() > 0) {
            index = g.layerCount() - 1;
            layer = g.layerAt(index);
            continue;
          }
        }
        // Walk back across siblings (and up to parents if needed).
        for (;;) {
          if (index >= 0) {
            const siblings = layer.siblings();
            layer = siblings[index];
            break;
          }
          layer = layer.parentLayer;
          if (!layer) break;
          index = layer.siblingIndex() - 1;
        }
      }
    } while (layer && !(layer.layerType & this.mLayerTypes));

    this.mCurrentLayer = layer;
    this.mSiblingIndex = index;
    return layer;
  }
}

/** Returns the global (depth-first) index of `layer` within its map, or `-1`. */
export function globalIndex(layer: Layer | undefined): number {
  if (!layer || !layer.map) return -1;
  const it = new LayerIterator(layer.map);
  let index = 0;
  while (it.next() && it.currentLayer() !== layer) index += 1;
  return it.currentLayer() === layer ? index : -1;
}

/** Inverse of `globalIndex`. */
export function layerAtGlobalIndex(map: TiledMap | undefined, index: number): Layer | undefined {
  if (!map) return undefined;
  const it = new LayerIterator(map);
  let i = index;
  while (it.next() && i > 0) i -= 1;
  return it.currentLayer();
}
