// Port of libtiled/tilelayer.h+cpp.
//
// TileLayer is a sparse grid of `Cell`s organised into 16×16 `Chunk`s. We
// keep the same chunk shape so the TMX writer's `<chunk>` segmentation maps
// 1:1 onto the upstream layout.

import { Layer, LayerTypeFlag } from './layer.js';
import { Cell } from './cell.js';
import { TileRegion } from './region.js';
import { CHUNK_SIZE, CHUNK_BITS, CHUNK_MASK, FlipDirection, RotateDirection } from './tiled.js';
import type { Margins, Point, Rect, Size } from './types.js';
import type { Tile } from './tile.js';
import type { Tileset } from './tileset.js';
import type { Map as TiledMap } from './map.js';

export class Chunk {
  readonly grid: Cell[] = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(Cell.empty);

  cellAt(x: number, y: number): Cell {
    return this.grid[x + y * CHUNK_SIZE] ?? Cell.empty;
  }

  setCell(x: number, y: number, cell: Cell): void {
    this.grid[x + y * CHUNK_SIZE] = cell;
  }

  isEmpty(): boolean {
    return this.grid.every((c) => c.isEmpty());
  }

  hasCell(predicate: (c: Cell) => boolean): boolean {
    return this.grid.some(predicate);
  }

  region(predicate: (c: Cell) => boolean): TileRegion {
    const r = new TileRegion();
    for (let i = 0; i < this.grid.length; i++) {
      if (predicate(this.grid[i]!)) {
        const x = i & CHUNK_MASK;
        const y = i >> CHUNK_BITS;
        r.addCell(x, y);
      }
    }
    return r;
  }

  removeReferencesToTileset(tileset: Tileset): void {
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i]!.tileset === tileset) this.grid[i] = new Cell();
    }
  }

  replaceReferencesToTileset(oldTileset: Tileset, newTileset: Tileset): void {
    for (const c of this.grid) {
      if (c.tileset === oldTileset) c.setTile(newTileset, c.tileId);
    }
  }
}

function chunkKey(cx: number, cy: number): number {
  // 32-bit interleave of (cx, cy) for the chunk-position hash.
  return ((cy + 0x8000) << 16) | (cx + 0x8000);
}

export class TileLayer extends Layer {
  private _width: number;
  private _height: number;
  private _chunks: Map<number, Chunk> = new Map();
  private _bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private _usedTilesets: Set<Tileset> = new Set();
  private _usedTilesetsDirty = true;

  constructor(name = '', x = 0, y = 0, width = 0, height = 0) {
    super(LayerTypeFlag.TileLayerType, name, x, y);
    this._width = width;
    this._height = height;
  }

  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }
  get size(): Size {
    return { width: this._width, height: this._height };
  }
  setSize(s: Size): void {
    this._width = s.width;
    this._height = s.height;
  }

  rect(): Rect {
    return { x: this.x, y: this.y, width: this._width, height: this._height };
  }

  bounds(): Rect {
    return {
      x: this._bounds.x + this.x,
      y: this._bounds.y + this.y,
      width: this._bounds.width,
      height: this._bounds.height,
    };
  }

  localBounds(): Rect {
    return this._bounds;
  }

  drawMargins(): Margins {
    // Renderer-dependent in upstream, but TileLayer itself contributes none.
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this._width && y < this._height;
  }

  chunk(x: number, y: number): Chunk {
    const key = chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS);
    let c = this._chunks.get(key);
    if (!c) {
      c = new Chunk();
      this._chunks.set(key, c);
    }
    return c;
  }

  findChunk(x: number, y: number): Chunk | undefined {
    return this._chunks.get(chunkKey(x >> CHUNK_BITS, y >> CHUNK_BITS));
  }

  cellAt(x: number, y: number): Cell {
    const c = this.findChunk(x, y);
    if (!c) return Cell.empty;
    return c.cellAt(x & CHUNK_MASK, y & CHUNK_MASK);
  }

  setCell(x: number, y: number, cell: Cell): void {
    this.chunk(x, y).setCell(x & CHUNK_MASK, y & CHUNK_MASK, cell);
    this._usedTilesetsDirty = true;
    if (!cell.isEmpty()) this.expandBoundsTo(x, y);
  }

  setTiles(area: TileRegion, tile: Tile | null): void {
    const cell = tile ? new Cell(tile.tileset, tile.id) : new Cell();
    for (const p of area) this.setCell(p.x, p.y, cell);
  }

  copy(region: TileRegion | Rect): TileLayer {
    const r = region instanceof TileRegion ? region : TileRegion.fromRect(region);
    const bb = r.boundingRect();
    const out = new TileLayer('', 0, 0, bb.width, bb.height);
    for (const p of r) {
      const cell = this.cellAt(p.x, p.y);
      if (!cell.isEmpty()) out.setCell(p.x - bb.x, p.y - bb.y, cell);
    }
    return out;
  }

  /** Stamps the cells from `layer` over this one at offset `pos`. */
  merge(pos: Point, layer: TileLayer): void {
    for (const [, chunk] of layer._chunks) {
      for (let i = 0; i < chunk.grid.length; i++) {
        const c = chunk.grid[i]!;
        if (c.isEmpty()) continue;
        const lx = i & CHUNK_MASK;
        const ly = i >> CHUNK_BITS;
        // We need the chunk-coordinates back. Walk the map of chunks linearly.
      }
    }
    // Simpler: iterate every non-empty cell directly via `forEachCell`.
    layer.forEachCell((x, y, c) => {
      if (c.isEmpty()) return;
      this.setCell(pos.x + x, pos.y + y, c);
    });
  }

  /** Removes (sets to empty) every cell within the region. */
  erase(region: TileRegion): void {
    const empty = new Cell();
    for (const p of region) this.setCell(p.x, p.y, empty);
  }

  clear(): void {
    this._chunks.clear();
    this._bounds = { x: 0, y: 0, width: 0, height: 0 };
    this._usedTilesetsDirty = true;
  }

  setCells(x: number, y: number, layer: TileLayer, area?: TileRegion): void {
    if (!area) {
      area = TileRegion.fromRect({ x, y, width: layer.width, height: layer.height });
    }
    for (const p of area) {
      this.setCell(p.x, p.y, layer.cellAt(p.x - x, p.y - y));
    }
  }

  /* ─── flips / rotation (cell-only, no resize) ─── */

  flip(direction: FlipDirection): void {
    const w = this._width;
    const h = this._height;
    const newCells: Cell[] = new Array(w * h).fill(Cell.empty);
    this.forEachCell((x, y, c) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const nx = direction === FlipDirection.FlipHorizontally ? w - 1 - x : x;
      const ny = direction === FlipDirection.FlipVertically ? h - 1 - y : y;
      const cc = Cell.from(c);
      if (direction === FlipDirection.FlipHorizontally) cc.setFlippedHorizontally(!cc.flippedHorizontally());
      else cc.setFlippedVertically(!cc.flippedVertically());
      newCells[nx + ny * w] = cc;
    });
    this._chunks.clear();
    this._bounds = { x: 0, y: 0, width: 0, height: 0 };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = newCells[x + y * w]!;
        if (!c.isEmpty()) this.setCell(x, y, c);
      }
    }
  }

  rotate(direction: RotateDirection): void {
    const w = this._width;
    const h = this._height;
    const nw = h;
    const nh = w;
    const newCells: Cell[] = new Array(nw * nh).fill(Cell.empty);
    this.forEachCell((x, y, c) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const nx = direction === RotateDirection.RotateRight ? h - 1 - y : y;
      const ny = direction === RotateDirection.RotateRight ? x : w - 1 - x;
      const cc = Cell.from(c);
      cc.rotate(direction);
      newCells[nx + ny * nw] = cc;
    });
    this._width = nw;
    this._height = nh;
    this._chunks.clear();
    this._bounds = { x: 0, y: 0, width: 0, height: 0 };
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const c = newCells[x + y * nw]!;
        if (!c.isEmpty()) this.setCell(x, y, c);
      }
    }
  }

  /* ─── tilesets ─── */

  override usedTilesets(): Set<Tileset> {
    if (this._usedTilesetsDirty) {
      this._usedTilesets.clear();
      this.forEachCell((_x, _y, c) => {
        if (c.tileset) this._usedTilesets.add(c.tileset);
      });
      this._usedTilesetsDirty = false;
    }
    return new Set(this._usedTilesets);
  }

  override referencesTileset(tileset: Tileset): boolean {
    for (const ts of this.usedTilesets()) if (ts === tileset) return true;
    return false;
  }

  removeReferencesToTileset(tileset: Tileset): void {
    for (const c of this._chunks.values()) c.removeReferencesToTileset(tileset);
    this._usedTilesetsDirty = true;
  }

  override replaceReferencesToTileset(oldTileset: Tileset, newTileset: Tileset): void {
    for (const c of this._chunks.values()) c.replaceReferencesToTileset(oldTileset, newTileset);
    this._usedTilesetsDirty = true;
  }

  /* ─── geometry ops ─── */

  resize(size: Size, offset: Point): void {
    const w = this._width;
    const h = this._height;
    const newCells: Cell[] = new Array(size.width * size.height).fill(Cell.empty);
    this.forEachCell((x, y, c) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const nx = x + offset.x;
      const ny = y + offset.y;
      if (nx >= 0 && nx < size.width && ny >= 0 && ny < size.height) {
        newCells[nx + ny * size.width] = c;
      }
    });
    this._width = size.width;
    this._height = size.height;
    this._chunks.clear();
    this._bounds = { x: 0, y: 0, width: 0, height: 0 };
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const c = newCells[x + y * size.width]!;
        if (!c.isEmpty()) this.setCell(x, y, c);
      }
    }
  }

  offsetTiles(offset: Point, bounds: Rect = this.rect(), wrapX = false, wrapY = false): void {
    const w = bounds.width;
    const h = bounds.height;
    const snapshot: { x: number; y: number; cell: Cell }[] = [];
    this.forEachCell((x, y, c) => {
      if (
        x < bounds.x ||
        x >= bounds.x + bounds.width ||
        y < bounds.y ||
        y >= bounds.y + bounds.height
      )
        return;
      snapshot.push({ x, y, cell: c });
    });
    for (const s of snapshot) this.setCell(s.x, s.y, new Cell());
    for (const s of snapshot) {
      let nx = s.x + offset.x;
      let ny = s.y + offset.y;
      if (wrapX) nx = bounds.x + (((nx - bounds.x) % w) + w) % w;
      if (wrapY) ny = bounds.y + (((ny - bounds.y) % h) + h) % h;
      if (
        nx >= bounds.x &&
        nx < bounds.x + bounds.width &&
        ny >= bounds.y &&
        ny < bounds.y + bounds.height
      ) {
        this.setCell(nx, ny, s.cell);
      }
    }
  }

  /* ─── regions ─── */

  region(predicate: (c: Cell) => boolean = (c) => !c.isEmpty()): TileRegion {
    const r = new TileRegion();
    this.forEachCell((x, y, c) => {
      if (predicate(c)) r.addCell(x, y);
    });
    return r;
  }

  modifiedRegion(): TileRegion {
    return this.region((c) => !c.isEmpty() || c.checked());
  }

  computeDiffRegion(other: TileLayer): TileRegion {
    const r = new TileRegion();
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const w = Math.max(this._width, other._width + dx);
    const h = Math.max(this._height, other._height + dy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = this.cellAt(x, y);
        const b = other.cellAt(x - dx, y - dy);
        if (!a.equals(b)) r.addCell(x, y);
      }
    }
    return r;
  }

  /* ─── Layer overrides ─── */

  override isEmpty(): boolean {
    for (const c of this._chunks.values()) if (!c.isEmpty()) return false;
    return true;
  }

  hasCell(predicate: (c: Cell) => boolean): boolean {
    for (const c of this._chunks.values()) if (c.hasCell(predicate)) return true;
    return false;
  }

  override canMergeWith(other: Layer): boolean {
    return other.isTileLayer();
  }

  override mergedWith(other: Layer): Layer {
    if (!other.isTileLayer()) throw new Error('mergedWith expects a TileLayer');
    const merged = this.clone();
    const ot = other as TileLayer;
    merged.merge({ x: ot.x - this.x, y: ot.y - this.y }, ot);
    return merged;
  }

  override clone(): TileLayer {
    const c = new TileLayer(this.name, this.x, this.y, this._width, this._height);
    this.initializeClone(c);
    this.forEachCell((x, y, cell) => {
      if (!cell.isEmpty()) c.setCell(x, y, Cell.from(cell));
    });
    return c;
  }

  /* ─── helpers ─── */

  forEachCell(visitor: (x: number, y: number, cell: Cell) => void): void {
    for (const [k, chunk] of this._chunks) {
      const cy = ((k >>> 16) & 0xffff) - 0x8000;
      const cx = (k & 0xffff) - 0x8000;
      for (let i = 0; i < chunk.grid.length; i++) {
        const cell = chunk.grid[i]!;
        const x = (cx << CHUNK_BITS) + (i & CHUNK_MASK);
        const y = (cy << CHUNK_BITS) + (i >> CHUNK_BITS);
        visitor(x, y, cell);
      }
    }
  }

  *cells(): IterableIterator<{ x: number; y: number; cell: Cell }> {
    for (const [k, chunk] of this._chunks) {
      const cy = ((k >>> 16) & 0xffff) - 0x8000;
      const cx = (k & 0xffff) - 0x8000;
      for (let i = 0; i < chunk.grid.length; i++) {
        const cell = chunk.grid[i]!;
        const x = (cx << CHUNK_BITS) + (i & CHUNK_MASK);
        const y = (cy << CHUNK_BITS) + (i >> CHUNK_BITS);
        yield { x, y, cell };
      }
    }
  }

  /** Chunks ordered by (y, x) for deterministic write output. */
  sortedChunksToWrite(_chunkSize: Size = { width: CHUNK_SIZE, height: CHUNK_SIZE }): Rect[] {
    const out: Rect[] = [];
    for (const [k] of this._chunks) {
      const cy = ((k >>> 16) & 0xffff) - 0x8000;
      const cx = (k & 0xffff) - 0x8000;
      out.push({ x: cx * CHUNK_SIZE, y: cy * CHUNK_SIZE, width: CHUNK_SIZE, height: CHUNK_SIZE });
    }
    out.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    return out;
  }

  /* ─── private ─── */

  private expandBoundsTo(x: number, y: number): void {
    if (this._bounds.width === 0 && this._bounds.height === 0) {
      this._bounds = { x, y, width: 1, height: 1 };
      return;
    }
    const x1 = Math.min(this._bounds.x, x);
    const y1 = Math.min(this._bounds.y, y);
    const x2 = Math.max(this._bounds.x + this._bounds.width - 1, x);
    const y2 = Math.max(this._bounds.y + this._bounds.height - 1, y);
    this._bounds = { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
  }
}
// Suppress unused-import warning — kept for parity with upstream types.
export type { TiledMap };
