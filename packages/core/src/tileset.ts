// Port of libtiled/tileset.h+cpp.
//
// Image-loading methods (`loadFromImage`, `loadImage`, `initializeTilesetTiles`)
// are deliberately *not* ported here — they require a real `QImage`/HTMLImage
// and so live in `@tiled-ts/render-pixi`. This module owns the data model.

import { TiledObject, ObjectTypeId } from './object.js';
import { type Point, type Rect, type Size } from './types.js';
import { Alignment, LoadingStatus } from './tiled.js';
import type { ColorString } from './types.js';
import { type ImageReference, makeImageReference } from './imageReference.js';
import { Tile } from './tile.js';
import type { WangSet } from './wangset.js';
import { cloneProperties } from './properties.js';

export enum TilesetOrientation {
  Orthogonal = 0,
  Isometric = 1,
}

export enum TileRenderSize {
  TileSize = 0,
  GridSize = 1,
}

export enum FillMode {
  Stretch = 0,
  PreserveAspectFit = 1,
}

export enum TransformationFlag {
  NoTransformation = 0,
  AllowFlipHorizontally = 1 << 0,
  AllowFlipVertically = 1 << 1,
  AllowRotate = 1 << 2,
  PreferUntransformed = 1 << 3,
}

export class Tileset extends TiledObject {
  exportFileName = '';
  exportFormat = '';

  private _name: string;
  private _fileName = '';
  private _format = '';

  imageReference: ImageReference = makeImageReference();
  private _tileWidth: number;
  private _tileHeight: number;
  private _tileSpacing: number;
  private _margin: number;

  tileOffset: Point = { x: 0, y: 0 };
  objectAlignment: Alignment = Alignment.Unspecified;
  orientation: TilesetOrientation = TilesetOrientation.Orthogonal;
  tileRenderSize: TileRenderSize = TileRenderSize.TileSize;
  fillMode: FillMode = FillMode.Stretch;
  gridSize: Size = { width: 0, height: 0 };

  private _columnCount = 0;
  private _expectedColumnCount = 0;
  private _expectedRowCount = 0;
  private _nextTileId = 0;

  private readonly _tilesById: Map<number, Tile> = new Map();
  private readonly _tiles: Tile[] = [];
  private readonly _wangSets: WangSet[] = [];
  private _status: LoadingStatus = LoadingStatus.LoadingReady;

  backgroundColor: ColorString | undefined = undefined;
  transformationFlags = 0;

  /** @internal — used by the editor to track the on-disk version we cloned from. */
  originalTileset: Tileset | undefined = undefined;

  constructor(name: string, tileWidth: number, tileHeight: number, tileSpacing = 0, margin = 0) {
    super(ObjectTypeId.TilesetType);
    this._name = name;
    this._tileWidth = tileWidth;
    this._tileHeight = tileHeight;
    this._tileSpacing = tileSpacing;
    this._margin = margin;
  }

  /** Convenience matching the C++ `Tileset::create` factory. */
  static create(name: string, tileWidth: number, tileHeight: number, tileSpacing = 0, margin = 0): Tileset {
    return new Tileset(name, tileWidth, tileHeight, tileSpacing, margin);
  }

  /* ───────────────── identity / file binding ───────────────── */

  get name(): string {
    return this._name;
  }
  setName(n: string): void {
    this._name = n;
  }

  get fileName(): string {
    return this._fileName;
  }
  setFileName(f: string): void {
    this._fileName = f;
  }

  get isExternal(): boolean {
    return this._fileName.length > 0;
  }

  get format(): string {
    return this._format;
  }
  setFormat(f: string): void {
    this._format = f;
  }

  /* ───────────────── geometry ───────────────── */

  get tileWidth(): number {
    return this._tileWidth;
  }
  get tileHeight(): number {
    return this._tileHeight;
  }
  get tileSize(): Size {
    return { width: this._tileWidth, height: this._tileHeight };
  }
  setTileSize(s: Size): void {
    const old = { width: this._tileWidth, height: this._tileHeight };
    this._tileWidth = s.width;
    this._tileHeight = s.height;
    this.maybeUpdateTileSize(old, s);
  }

  get tileSpacing(): number {
    return this._tileSpacing;
  }
  setTileSpacing(s: number): void {
    this._tileSpacing = s;
  }

  get margin(): number {
    return this._margin;
  }
  setMargin(m: number): void {
    this._margin = m;
  }

  /* ───────────────── tiles ───────────────── */

  get tiles(): readonly Tile[] {
    return this._tiles;
  }
  get tilesById(): ReadonlyMap<number, Tile> {
    return this._tilesById;
  }
  get tileCount(): number {
    return this._tiles.length;
  }

  findTile(id: number): Tile | undefined {
    return this._tilesById.get(id);
  }

  /** Python-API alias of `findTile`. */
  tileAt(id: number): Tile | undefined {
    return this.findTile(id);
  }

  findTileLocation(tile: Tile): number {
    return this._tiles.indexOf(tile);
  }

  findOrCreateTile(id: number): Tile {
    const existing = this._tilesById.get(id);
    if (existing) return existing;
    const t = new Tile(id, this);
    this._tiles.push(t);
    this._tilesById.set(id, t);
    if (id >= this._nextTileId) this._nextTileId = id + 1;
    return t;
  }

  addTile(imageRect: Rect = { x: 0, y: 0, width: 0, height: 0 }, source = ''): Tile {
    const id = this.takeNextTileId();
    const t = new Tile(id, this);
    t.imageRect = imageRect;
    t.imageSource = source;
    this._tiles.push(t);
    this._tilesById.set(id, t);
    return t;
  }

  addTiles(tiles: Tile[]): void {
    for (const t of tiles) {
      this._tiles.push(t);
      this._tilesById.set(t.id, t);
      if (t.id >= this._nextTileId) this._nextTileId = t.id + 1;
    }
  }

  removeTiles(tiles: Tile[]): void {
    for (const t of tiles) {
      const i = this._tiles.indexOf(t);
      if (i >= 0) this._tiles.splice(i, 1);
      this._tilesById.delete(t.id);
    }
  }

  deleteTile(id: number): void {
    const t = this._tilesById.get(id);
    if (!t) return;
    this.removeTiles([t]);
  }

  /**
   * Move the given tiles to be consecutive starting at `location` in the
   * ordered list. Returns the prior locations so the inverse command can undo.
   */
  relocateTiles(tiles: Tile[], location: number): number[] {
    const oldLocations = tiles.map((t) => this._tiles.indexOf(t));
    for (const t of tiles) {
      const i = this._tiles.indexOf(t);
      if (i >= 0) this._tiles.splice(i, 1);
    }
    let insertAt = location;
    for (const t of tiles) this._tiles.splice(insertAt++, 0, t);
    return oldLocations;
  }

  anyTileOutOfOrder(): boolean {
    let last = -1;
    for (const t of this._tiles) {
      if (t.id < last) return true;
      last = t.id;
    }
    return false;
  }

  resetTileOrder(): void {
    this._tiles.sort((a, b) => a.id - b.id);
  }

  /* ───────────────── ids ───────────────── */

  get nextTileId(): number {
    return this._nextTileId;
  }
  setNextTileId(id: number): void {
    if (id <= 0) throw new RangeError('nextTileId must be positive');
    this._nextTileId = id;
  }
  takeNextTileId(): number {
    return this._nextTileId++;
  }

  /* ───────────────── image-grid metadata ───────────────── */

  get columnCount(): number {
    return this._columnCount;
  }
  setColumnCount(c: number): void {
    this._columnCount = c;
  }
  get expectedColumnCount(): number {
    return this._expectedColumnCount;
  }
  get expectedRowCount(): number {
    return this._expectedRowCount;
  }

  syncExpectedColumnsAndRows(): void {
    this._expectedColumnCount = this._columnCount;
    this._expectedRowCount = this.rowCount();
  }

  rowCount(): number {
    if (this._columnCount <= 0) return 0;
    return Math.ceil(this._tiles.length / this._columnCount);
  }

  columnCountForWidth(width: number): number {
    if (this._tileWidth <= 0) return 0;
    return Math.floor(
      (width - this._margin + this._tileSpacing) / (this._tileWidth + this._tileSpacing),
    );
  }

  rowCountForHeight(height: number): number {
    if (this._tileHeight <= 0) return 0;
    return Math.floor(
      (height - this._margin + this._tileSpacing) / (this._tileHeight + this._tileSpacing),
    );
  }

  get imageWidth(): number {
    return this.imageReference.size.width;
  }
  get imageHeight(): number {
    return this.imageReference.size.height;
  }

  get imageSource(): string {
    return this.imageReference.source;
  }
  setImageSource(s: string): void {
    this.imageReference.source = s;
  }

  get isCollection(): boolean {
    return this.imageReference.source.length === 0;
  }

  setImageReference(ref: ImageReference): void {
    this.imageReference = { ...ref };
  }

  get transparentColor(): ColorString | undefined {
    return this.imageReference.transparentColor;
  }
  setTransparentColor(c: ColorString | undefined): void {
    this.imageReference.transparentColor = c;
  }

  /* ───────────────── status ───────────────── */

  get status(): LoadingStatus {
    return this._status;
  }
  setStatus(s: LoadingStatus): void {
    this._status = s;
  }
  get imageStatus(): LoadingStatus {
    return this.imageReference.status;
  }
  setImageStatus(s: LoadingStatus): void {
    this.imageReference.status = s;
  }

  /* ───────────────── wang sets ───────────────── */

  get wangSets(): readonly WangSet[] {
    return this._wangSets;
  }
  get wangSetCount(): number {
    return this._wangSets.length;
  }
  wangSet(index: number): WangSet | undefined {
    return this._wangSets[index];
  }
  addWangSet(w: WangSet): void {
    this._wangSets.push(w);
  }
  insertWangSet(index: number, w: WangSet): void {
    this._wangSets.splice(index, 0, w);
  }
  takeWangSetAt(index: number): WangSet | undefined {
    const [w] = this._wangSets.splice(index, 1);
    return w;
  }

  /* ───────────────── tile-image plumbing ───────────────── */

  setTileImage(tile: Tile, imageRect: Rect, source = ''): void {
    tile.imageRect = imageRect;
    tile.imageSource = source;
  }
  setTileImageRect(tile: Tile, imageRect: Rect): void {
    tile.imageRect = imageRect;
  }

  /** Find a tileset in `candidates` that has the same image-reference + grid
   *  metadata as this one, so the editor can swap a freshly-loaded copy for the
   *  one already in memory. Mirrors `Tileset::findSimilarTileset`. */
  findSimilarTileset(candidates: readonly Tileset[]): Tileset | undefined {
    return candidates.find(
      (t) =>
        t !== this &&
        t.imageSource === this.imageSource &&
        t._tileWidth === this._tileWidth &&
        t._tileHeight === this._tileHeight &&
        t._tileSpacing === this._tileSpacing &&
        t._margin === this._margin,
    );
  }

  /* ───────────────── private helpers ───────────────── */

  private maybeUpdateTileSize(oldSize: Size, newSize: Size): void {
    if (oldSize.width === newSize.width && oldSize.height === newSize.height) return;
    if (this.isCollection) return;
    // For image-based tilesets, recompute imageRect for every tile so they
    // continue to map cleanly into the source image.
    this.updateTileSize();
  }

  private updateTileSize(): void {
    const cols = this._columnCount;
    if (cols <= 0) return;
    for (let i = 0; i < this._tiles.length; i++) {
      const t = this._tiles[i]!;
      const tx = i % cols;
      const ty = Math.floor(i / cols);
      t.imageRect = {
        x: this._margin + tx * (this._tileWidth + this._tileSpacing),
        y: this._margin + ty * (this._tileHeight + this._tileSpacing),
        width: this._tileWidth,
        height: this._tileHeight,
      };
    }
  }

  /* ───────────────── clone & swap ───────────────── */

  swap(other: Tileset): void {
    // Swap mutable members. Used by the editor when reloading a tileset.
    [this._name, other._name] = [other._name, this._name];
    [this._fileName, other._fileName] = [other._fileName, this._fileName];
    [this._format, other._format] = [other._format, this._format];
    [this.imageReference, other.imageReference] = [other.imageReference, this.imageReference];
    [this._tileWidth, other._tileWidth] = [other._tileWidth, this._tileWidth];
    [this._tileHeight, other._tileHeight] = [other._tileHeight, this._tileHeight];
    [this._tileSpacing, other._tileSpacing] = [other._tileSpacing, this._tileSpacing];
    [this._margin, other._margin] = [other._margin, this._margin];
    [this.tileOffset, other.tileOffset] = [other.tileOffset, this.tileOffset];
    [this.objectAlignment, other.objectAlignment] = [other.objectAlignment, this.objectAlignment];
    [this.orientation, other.orientation] = [other.orientation, this.orientation];
    [this.tileRenderSize, other.tileRenderSize] = [other.tileRenderSize, this.tileRenderSize];
    [this.fillMode, other.fillMode] = [other.fillMode, this.fillMode];
    [this.gridSize, other.gridSize] = [other.gridSize, this.gridSize];
    [this._columnCount, other._columnCount] = [other._columnCount, this._columnCount];
    [this._expectedColumnCount, other._expectedColumnCount] = [
      other._expectedColumnCount,
      this._expectedColumnCount,
    ];
    [this._expectedRowCount, other._expectedRowCount] = [
      other._expectedRowCount,
      this._expectedRowCount,
    ];
    [this._nextTileId, other._nextTileId] = [other._nextTileId, this._nextTileId];

    // Swap tiles wholesale.
    const tilesA = this._tiles.splice(0);
    const tilesB = other._tiles.splice(0);
    this._tiles.push(...tilesB);
    other._tiles.push(...tilesA);

    this._tilesById.clear();
    for (const t of this._tiles) this._tilesById.set(t.id, t);
    other._tilesById.clear();
    for (const t of other._tiles) other._tilesById.set(t.id, t);

    const wsA = this._wangSets.splice(0);
    const wsB = other._wangSets.splice(0);
    this._wangSets.push(...wsB);
    other._wangSets.push(...wsA);

    [this._status, other._status] = [other._status, this._status];
    [this.backgroundColor, other.backgroundColor] = [other.backgroundColor, this.backgroundColor];
    [this.transformationFlags, other.transformationFlags] = [
      other.transformationFlags,
      this.transformationFlags,
    ];
  }

  clone(): Tileset {
    const c = new Tileset(this._name, this._tileWidth, this._tileHeight, this._tileSpacing, this._margin);
    c.setClassName(this.className);
    c.setProperties(cloneProperties(this.properties));
    c._fileName = this._fileName;
    c._format = this._format;
    c.exportFileName = this.exportFileName;
    c.exportFormat = this.exportFormat;
    c.imageReference = { ...this.imageReference };
    c.tileOffset = { ...this.tileOffset };
    c.objectAlignment = this.objectAlignment;
    c.orientation = this.orientation;
    c.tileRenderSize = this.tileRenderSize;
    c.fillMode = this.fillMode;
    c.gridSize = { ...this.gridSize };
    c._columnCount = this._columnCount;
    c._expectedColumnCount = this._expectedColumnCount;
    c._expectedRowCount = this._expectedRowCount;
    c._nextTileId = this._nextTileId;
    c.backgroundColor = this.backgroundColor;
    c.transformationFlags = this.transformationFlags;
    for (const t of this._tiles) {
      const ct = t.clone(c);
      c._tiles.push(ct);
      c._tilesById.set(ct.id, ct);
    }
    return c;
  }
}

/* ───────────────────────── string helpers ────────────────────────────── */

export function tilesetOrientationToString(o: TilesetOrientation): string {
  return o === TilesetOrientation.Isometric ? 'isometric' : 'orthogonal';
}

export function tilesetOrientationFromString(s: string): TilesetOrientation {
  return s === 'isometric' ? TilesetOrientation.Isometric : TilesetOrientation.Orthogonal;
}

export function tileRenderSizeToString(t: TileRenderSize): string {
  return t === TileRenderSize.GridSize ? 'grid' : 'tile';
}
export function tileRenderSizeFromString(s: string): TileRenderSize {
  return s === 'grid' ? TileRenderSize.GridSize : TileRenderSize.TileSize;
}

export function fillModeToString(f: FillMode): string {
  return f === FillMode.PreserveAspectFit ? 'preserve-aspect-fit' : 'stretch';
}
export function fillModeFromString(s: string): FillMode {
  return s === 'preserve-aspect-fit' ? FillMode.PreserveAspectFit : FillMode.Stretch;
}
