// Port of libtiled/map.h+cpp.

import { TiledObject, ObjectTypeId } from './object.js';
import { Layer, LayerIterator, LayerTypeFlag } from './layer.js';
import type { ColorString, Point, Rect, Size } from './types.js';
import { CHUNK_SIZE } from './tiled.js';
import type { Tileset } from './tileset.js';
import type { ObjectGroup } from './objectgroup.js';
import { GroupLayer } from './grouplayer.js';
import type { TileLayer } from './tilelayer.js';
import type { ImageLayer } from './imagelayer.js';
import type { MapObject } from './mapobject.js';
import type { ObjectTemplate } from './objecttemplate.js';
import { TileRegion } from './region.js';
import { StaggerAxis, StaggerIndex } from './hex.js';
export { StaggerAxis, StaggerIndex };

export enum MapOrientation {
  Unknown = 0,
  Orthogonal = 1,
  Isometric = 2,
  Staggered = 3,
  Hexagonal = 4,
  Oblique = 5,
}

export enum LayerDataFormat {
  XML = 0,
  Base64 = 1,
  Base64Gzip = 2,
  Base64Zlib = 3,
  Base64Zstandard = 4,
  CSV = 5,
}

export enum RenderOrder {
  RightDown = 0,
  RightUp = 1,
  LeftDown = 2,
  LeftUp = 3,
}

export interface MapParameters {
  orientation: MapOrientation;
  renderOrder: RenderOrder;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  infinite: boolean;
  hexSideLength: number;
  staggerAxis: StaggerAxis;
  staggerIndex: StaggerIndex;
  skewX: number;
  skewY: number;
  parallaxOrigin: Point;
  backgroundColor: ColorString | undefined;
}

export interface MapEditorSettings {
  compressionLevel: number;
  chunkSize: Size;
  layerDataFormat: LayerDataFormat;
}

export class Map extends TiledObject {
  fileName = '';
  exportFileName = '';
  exportFormat = '';

  parameters: MapParameters;
  editorSettings: MapEditorSettings = {
    compressionLevel: -1,
    chunkSize: { width: CHUNK_SIZE, height: CHUNK_SIZE },
    layerDataFormat: LayerDataFormat.Base64Zlib,
  };

  layers: Layer[] = [];
  tilesets: Tileset[] = [];

  private _nextLayerId = 1;
  private _nextObjectId = 1;
  private _drawMarginsDirty = true;

  constructor(params?: Partial<MapParameters>) {
    super(ObjectTypeId.MapType);
    this.parameters = {
      orientation: params?.orientation ?? MapOrientation.Orthogonal,
      renderOrder: params?.renderOrder ?? RenderOrder.RightDown,
      width: params?.width ?? 0,
      height: params?.height ?? 0,
      tileWidth: params?.tileWidth ?? 0,
      tileHeight: params?.tileHeight ?? 0,
      infinite: params?.infinite ?? false,
      hexSideLength: params?.hexSideLength ?? 0,
      staggerAxis: params?.staggerAxis ?? StaggerAxis.StaggerY,
      staggerIndex: params?.staggerIndex ?? StaggerIndex.StaggerOdd,
      skewX: params?.skewX ?? 0,
      skewY: params?.skewY ?? 0,
      parallaxOrigin: params?.parallaxOrigin ?? { x: 0, y: 0 },
      backgroundColor: params?.backgroundColor,
    };
  }

  /* ─── parameter accessors (1:1 with C++ inline getters) ─── */
  get orientation(): MapOrientation {
    return this.parameters.orientation;
  }
  setOrientation(o: MapOrientation): void {
    this.parameters.orientation = o;
  }
  get renderOrder(): RenderOrder {
    return this.parameters.renderOrder;
  }
  setRenderOrder(o: RenderOrder): void {
    this.parameters.renderOrder = o;
  }
  get width(): number {
    return this.parameters.width;
  }
  setWidth(w: number): void {
    this.parameters.width = w;
  }
  get height(): number {
    return this.parameters.height;
  }
  setHeight(h: number): void {
    this.parameters.height = h;
  }
  get size(): Size {
    return { width: this.parameters.width, height: this.parameters.height };
  }
  get tileWidth(): number {
    return this.parameters.tileWidth;
  }
  setTileWidth(w: number): void {
    this.parameters.tileWidth = w;
  }
  get tileHeight(): number {
    return this.parameters.tileHeight;
  }
  setTileHeight(h: number): void {
    this.parameters.tileHeight = h;
  }
  get tileSize(): Size {
    return { width: this.parameters.tileWidth, height: this.parameters.tileHeight };
  }
  setTileSize(s: Size): void {
    this.parameters.tileWidth = s.width;
    this.parameters.tileHeight = s.height;
  }
  get infinite(): boolean {
    return this.parameters.infinite;
  }
  setInfinite(b: boolean): void {
    this.parameters.infinite = b;
  }
  get hexSideLength(): number {
    return this.parameters.hexSideLength;
  }
  setHexSideLength(l: number): void {
    this.parameters.hexSideLength = l;
  }
  get staggerAxis(): StaggerAxis {
    return this.parameters.staggerAxis;
  }
  setStaggerAxis(a: StaggerAxis): void {
    this.parameters.staggerAxis = a;
  }
  get staggerIndex(): StaggerIndex {
    return this.parameters.staggerIndex;
  }
  setStaggerIndex(i: StaggerIndex): void {
    this.parameters.staggerIndex = i;
  }
  invertStaggerIndex(): void {
    this.parameters.staggerIndex =
      this.parameters.staggerIndex === StaggerIndex.StaggerOdd
        ? StaggerIndex.StaggerEven
        : StaggerIndex.StaggerOdd;
  }
  get backgroundColor(): ColorString | undefined {
    return this.parameters.backgroundColor;
  }
  setBackgroundColor(c: ColorString | undefined): void {
    this.parameters.backgroundColor = c;
  }
  get chunkSize(): Size {
    return this.editorSettings.chunkSize;
  }
  setChunkSize(s: Size): void {
    this.editorSettings.chunkSize = s;
  }
  get layerDataFormat(): LayerDataFormat {
    return this.editorSettings.layerDataFormat;
  }
  setLayerDataFormat(f: LayerDataFormat): void {
    this.editorSettings.layerDataFormat = f;
  }
  get compressionLevel(): number {
    return this.editorSettings.compressionLevel;
  }
  setCompressionLevel(l: number): void {
    this.editorSettings.compressionLevel = l;
  }

  isStaggered(): boolean {
    return (
      this.parameters.orientation === MapOrientation.Hexagonal ||
      this.parameters.orientation === MapOrientation.Staggered
    );
  }

  /* ─── layer container ─── */

  layerCount(filter: number = LayerTypeFlag.AnyLayerType): number {
    if (filter === LayerTypeFlag.AnyLayerType) return this.layers.length;
    let count = 0;
    for (const l of this.layers) if (l.layerType & filter) count += 1;
    return count;
  }
  tileLayerCount(): number {
    return this.layerCount(LayerTypeFlag.TileLayerType);
  }
  objectGroupCount(): number {
    return this.layerCount(LayerTypeFlag.ObjectGroupType);
  }
  imageLayerCount(): number {
    return this.layerCount(LayerTypeFlag.ImageLayerType);
  }
  groupLayerCount(): number {
    return this.layerCount(LayerTypeFlag.GroupLayerType);
  }

  layerAt(i: number): Layer | undefined {
    return this.layers[i];
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
      removed.map = undefined;
      removed.parentLayer = undefined;
      if (removed.isGroupLayer()) (removed as GroupLayer).setMapInternal(undefined);
    }
    return removed;
  }

  findLayer(name: string, layerTypes: number = LayerTypeFlag.AnyLayerType): Layer | undefined {
    const it = new LayerIterator(this, layerTypes);
    let l: Layer | undefined;
    while ((l = it.next())) if (l.name === name) return l;
    return undefined;
  }

  findLayerById(id: number): Layer | undefined {
    const it = new LayerIterator(this);
    let l: Layer | undefined;
    while ((l = it.next())) if (l.id === id) return l;
    return undefined;
  }

  *allLayers(layerTypes: number = LayerTypeFlag.AnyLayerType): IterableIterator<Layer> {
    const it = new LayerIterator(this, layerTypes);
    let l: Layer | undefined;
    while ((l = it.next())) yield l;
  }
  *tileLayers(): IterableIterator<TileLayer> {
    for (const l of this.allLayers(LayerTypeFlag.TileLayerType)) yield l as TileLayer;
  }
  *objectGroups(): IterableIterator<ObjectGroup> {
    for (const l of this.allLayers(LayerTypeFlag.ObjectGroupType)) yield l as ObjectGroup;
  }
  *imageLayers(): IterableIterator<ImageLayer> {
    for (const l of this.allLayers(LayerTypeFlag.ImageLayerType)) yield l as ImageLayer;
  }

  findObjectById(objectId: number): MapObject | undefined {
    for (const og of this.objectGroups()) {
      for (const o of og.objects) if (o.id === objectId) return o;
    }
    return undefined;
  }

  /* ─── tileset container ─── */

  tilesetCount(): number {
    return this.tilesets.length;
  }
  tilesetAt(i: number): Tileset | undefined {
    return this.tilesets[i];
  }
  indexOfTileset(t: Tileset): number {
    return this.tilesets.indexOf(t);
  }

  addTileset(tileset: Tileset): boolean {
    if (this.tilesets.indexOf(tileset) >= 0) return false;
    this.tilesets.push(tileset);
    return true;
  }

  addTilesets(tilesets: Iterable<Tileset>): void {
    for (const t of tilesets) this.addTileset(t);
  }

  insertTileset(index: number, tileset: Tileset): void {
    if (this.tilesets.indexOf(tileset) >= 0) return;
    this.tilesets.splice(index, 0, tileset);
  }

  removeTilesetAt(index: number): Tileset | undefined {
    const [removed] = this.tilesets.splice(index, 1);
    return removed;
  }

  replaceTileset(oldTileset: Tileset, newTileset: Tileset): boolean {
    const i = this.tilesets.indexOf(oldTileset);
    if (i < 0) return false;
    if (this.tilesets.indexOf(newTileset) >= 0) {
      this.tilesets.splice(i, 1);
    } else {
      this.tilesets[i] = newTileset;
    }
    for (const l of this.allLayers()) l.replaceReferencesToTileset(oldTileset, newTileset);
    return true;
  }

  usedTilesets(): Set<Tileset> {
    const out = new Set<Tileset>();
    for (const l of this.allLayers()) for (const t of l.usedTilesets()) out.add(t);
    return out;
  }

  isTilesetUsed(t: Tileset): boolean {
    for (const l of this.allLayers()) if (l.referencesTileset(t)) return true;
    return false;
  }

  /* ─── id allocators ─── */

  setNextLayerId(id: number): void {
    this._nextLayerId = id;
  }
  get nextLayerId(): number {
    return this._nextLayerId;
  }
  takeNextLayerId(): number {
    return this._nextLayerId++;
  }

  setNextObjectId(id: number): void {
    this._nextObjectId = id;
  }
  get nextObjectId(): number {
    return this._nextObjectId;
  }
  takeNextObjectId(): number {
    return this._nextObjectId++;
  }

  initializeObjectIds(og: ObjectGroup): void {
    for (const o of og.objects) {
      if (o.id === 0) o.setId(this.takeNextObjectId());
    }
  }

  /* ─── derived geometry ─── */

  drawMargins(): { left: number; top: number; right: number; bottom: number } {
    if (this._drawMarginsDirty) {
      // Conservative — true value is renderer-dependent; kept as the union of
      // tileset tile sizes minus the map tile size so writers can use it.
      let m = { left: 0, top: 0, right: 0, bottom: 0 };
      for (const ts of this.tilesets) {
        const dx = Math.max(0, ts.tileWidth - this.parameters.tileWidth);
        const dy = Math.max(0, ts.tileHeight - this.parameters.tileHeight);
        m = {
          left: Math.max(m.left, dx),
          top: Math.max(m.top, dy),
          right: m.right,
          bottom: m.bottom,
        };
      }
      this._drawMargins = m;
      this._drawMarginsDirty = false;
    }
    return this._drawMargins;
  }
  invalidateDrawMargins(): void {
    this._drawMarginsDirty = true;
  }
  private _drawMargins = { left: 0, top: 0, right: 0, bottom: 0 };

  tileBoundingRect(): Rect {
    let bb: Rect = { x: 0, y: 0, width: 0, height: 0 };
    for (const tl of this.tileLayers()) {
      const lb = tl.bounds();
      bb = unionRect(bb, lb);
    }
    return bb;
  }

  modifiedTileRegion(): TileRegion {
    const r = new TileRegion();
    for (const tl of this.tileLayers()) {
      for (const p of tl.modifiedRegion()) r.addCell(p.x + tl.x, p.y + tl.y);
    }
    return r;
  }

  normalizeTileLayerPositionsAndMapSize(): void {
    let mx = Infinity;
    let my = Infinity;
    let mw = 0;
    let mh = 0;
    for (const tl of this.tileLayers()) {
      const b = tl.bounds();
      if (b.x < mx) mx = b.x;
      if (b.y < my) my = b.y;
      if (b.x + b.width > mw) mw = b.x + b.width;
      if (b.y + b.height > mh) mh = b.y + b.height;
    }
    if (!Number.isFinite(mx)) return;
    for (const tl of this.tileLayers()) {
      tl.x -= mx;
      tl.y -= my;
    }
    this.setWidth(mw - mx);
    this.setHeight(mh - my);
  }

  /* ─── object-template utilities ─── */

  replaceObjectTemplate(oldT: ObjectTemplate, newT: ObjectTemplate): MapObject[] {
    const updated: MapObject[] = [];
    for (const og of this.objectGroups()) {
      for (const o of og.objects) {
        if (o.objectTemplate === oldT) {
          o.setObjectTemplate(newT);
          o.syncWithTemplate();
          updated.push(o);
        }
      }
    }
    return updated;
  }

  /* ─── clone & copy ─── */

  clone(): Map {
    const c = new Map({ ...this.parameters });
    c.fileName = this.fileName;
    c.exportFileName = this.exportFileName;
    c.exportFormat = this.exportFormat;
    c.editorSettings = { ...this.editorSettings, chunkSize: { ...this.editorSettings.chunkSize } };
    c._nextLayerId = this._nextLayerId;
    c._nextObjectId = this._nextObjectId;
    c.setClassName(this.className);
    c.setProperties(this.properties);
    for (const ts of this.tilesets) c.tilesets.push(ts);
    for (const l of this.layers) c.addLayer(l.clone());
    return c;
  }

  /** @internal */
  adoptLayer(layer: Layer): void {
    layer.map = this;
    layer.parentLayer = undefined;
    if (layer.isGroupLayer()) (layer as GroupLayer).setMapInternal(this);
  }
}

/* ──────────────────────────── helpers ────────────────────────────────── */

function unionRect(a: Rect, b: Rect): Rect {
  if (a.width === 0 && a.height === 0) return { ...b };
  if (b.width === 0 && b.height === 0) return { ...a };
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/* ─────────────────────── enum ↔ string helpers ───────────────────────── */

export function orientationToString(o: MapOrientation): string {
  switch (o) {
    case MapOrientation.Orthogonal:
      return 'orthogonal';
    case MapOrientation.Isometric:
      return 'isometric';
    case MapOrientation.Staggered:
      return 'staggered';
    case MapOrientation.Hexagonal:
      return 'hexagonal';
    case MapOrientation.Oblique:
      return 'oblique';
    default:
      return 'unknown';
  }
}
export function orientationFromString(s: string): MapOrientation {
  switch (s) {
    case 'orthogonal':
      return MapOrientation.Orthogonal;
    case 'isometric':
      return MapOrientation.Isometric;
    case 'staggered':
      return MapOrientation.Staggered;
    case 'hexagonal':
      return MapOrientation.Hexagonal;
    case 'oblique':
      return MapOrientation.Oblique;
    default:
      return MapOrientation.Unknown;
  }
}

export function renderOrderToString(o: RenderOrder): string {
  return ['right-down', 'right-up', 'left-down', 'left-up'][o] ?? 'right-down';
}
export function renderOrderFromString(s: string): RenderOrder {
  switch (s) {
    case 'right-down':
      return RenderOrder.RightDown;
    case 'right-up':
      return RenderOrder.RightUp;
    case 'left-down':
      return RenderOrder.LeftDown;
    case 'left-up':
      return RenderOrder.LeftUp;
    default:
      return RenderOrder.RightDown;
  }
}

export function staggerAxisToString(a: StaggerAxis): string {
  return a === StaggerAxis.StaggerX ? 'x' : 'y';
}
export function staggerAxisFromString(s: string): StaggerAxis {
  return s === 'x' ? StaggerAxis.StaggerX : StaggerAxis.StaggerY;
}

export function staggerIndexToString(i: StaggerIndex): string {
  return i === StaggerIndex.StaggerEven ? 'even' : 'odd';
}
export function staggerIndexFromString(s: string): StaggerIndex {
  return s === 'even' ? StaggerIndex.StaggerEven : StaggerIndex.StaggerOdd;
}

export function layerDataFormatToString(f: LayerDataFormat): string {
  switch (f) {
    case LayerDataFormat.XML:
      return 'xml';
    case LayerDataFormat.Base64:
      return 'base64';
    case LayerDataFormat.Base64Gzip:
      return 'base64-gzip';
    case LayerDataFormat.Base64Zlib:
      return 'base64-zlib';
    case LayerDataFormat.Base64Zstandard:
      return 'base64-zstd';
    case LayerDataFormat.CSV:
      return 'csv';
  }
}
