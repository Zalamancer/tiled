// Port of `Tiled::Cell` from libtiled/tilelayer.h.
//
// A Cell is the value stored at each grid position of a tile layer: a tileset
// reference, a local tile id, and four bit-flags for the tile-flip state.

import type { Tile } from './tile.js';
import type { Tileset } from './tileset.js';
import { RotateDirection } from './tiled.js';

export enum CellFlag {
  FlippedHorizontally = 0x01,
  FlippedVertically = 0x02,
  FlippedAntiDiagonally = 0x04,
  RotatedHexagonal120 = 0x08,
  Checked = 0x10,
  VisualFlags = FlippedHorizontally | FlippedVertically | FlippedAntiDiagonally | RotatedHexagonal120,
}

/**
 * Mutable Cell — kept as a class to match the Qt API surface and so cell
 * objects can be aliased in undo state. The `tileset === null` form means
 * "empty cell".
 */
export class Cell {
  private _tileset: Tileset | null = null;
  private _tileId = -1;
  private _flags = 0;

  static empty: Cell = new Cell();

  constructor(tilesetOrTile?: Tileset | Tile | null, tileId?: number) {
    if (tilesetOrTile == null) return;
    if (tileId !== undefined) {
      this._tileset = tilesetOrTile as Tileset;
      this._tileId = tileId;
    } else {
      const t = tilesetOrTile as Tile;
      this._tileset = t.tileset;
      this._tileId = t.id;
    }
  }

  /** Convenience: build from an existing Cell, copying state. */
  static from(other: Cell): Cell {
    const c = new Cell();
    c._tileset = other._tileset;
    c._tileId = other._tileId;
    c._flags = other._flags;
    return c;
  }

  isEmpty(): boolean {
    return this._tileset === null;
  }

  equals(other: Cell): boolean {
    return (
      this._tileset === other._tileset &&
      this._tileId === other._tileId &&
      this.flags === other.flags
    );
  }

  /** Just the visible flag bits (drops `Checked`). */
  get flags(): number {
    return this._flags & CellFlag.VisualFlags;
  }

  get rawFlags(): number {
    return this._flags;
  }

  set rawFlags(v: number) {
    this._flags = v;
  }

  get tileset(): Tileset | null {
    return this._tileset;
  }
  get tileId(): number {
    return this._tileId;
  }

  flippedHorizontally(): boolean {
    return Boolean(this._flags & CellFlag.FlippedHorizontally);
  }
  flippedVertically(): boolean {
    return Boolean(this._flags & CellFlag.FlippedVertically);
  }
  flippedAntiDiagonally(): boolean {
    return Boolean(this._flags & CellFlag.FlippedAntiDiagonally);
  }
  rotatedHexagonal120(): boolean {
    return Boolean(this._flags & CellFlag.RotatedHexagonal120);
  }

  setFlippedHorizontally(v: boolean): void {
    this._flags = v ? this._flags | CellFlag.FlippedHorizontally : this._flags & ~CellFlag.FlippedHorizontally;
  }
  setFlippedVertically(v: boolean): void {
    this._flags = v ? this._flags | CellFlag.FlippedVertically : this._flags & ~CellFlag.FlippedVertically;
  }
  setFlippedAntiDiagonally(v: boolean): void {
    this._flags = v ? this._flags | CellFlag.FlippedAntiDiagonally : this._flags & ~CellFlag.FlippedAntiDiagonally;
  }
  setRotatedHexagonal120(v: boolean): void {
    this._flags = v ? this._flags | CellFlag.RotatedHexagonal120 : this._flags & ~CellFlag.RotatedHexagonal120;
  }

  checked(): boolean {
    return Boolean(this._flags & CellFlag.Checked);
  }
  setChecked(v: boolean): void {
    this._flags = v ? this._flags | CellFlag.Checked : this._flags & ~CellFlag.Checked;
  }

  tile(): Tile | undefined {
    return this._tileset?.findTile(this._tileId);
  }

  setTile(tilesetOrTile: Tileset | Tile | null, tileId?: number): void {
    if (tilesetOrTile == null) {
      this._tileset = null;
      this._tileId = -1;
      return;
    }
    if (tileId !== undefined) {
      this._tileset = tilesetOrTile as Tileset;
      this._tileId = tileId;
    } else {
      const t = tilesetOrTile as Tile;
      this._tileset = t.tileset;
      this._tileId = t.id;
    }
  }

  refersTile(tile: Tile): boolean {
    return this._tileset === tile.tileset && this._tileId === tile.id;
  }

  /**
   * In-place rotation by 90° in the requested direction. Mirrors
   * `Cell::rotate` from libtiled — modifies the H/V/AD flip bits in concert.
   * The hexagonal-rotation bit is preserved verbatim.
   */
  rotate(direction: RotateDirection): void {
    // Index = (H<<2) | (V<<1) | AD
    const tables: ReadonlyArray<ReadonlyArray<number>> = [
      [3, 2, 7, 6, 1, 0, 5, 4], // RotateLeft  = 0
      [5, 4, 1, 0, 7, 6, 3, 2], // RotateRight = 1
    ];
    const idx =
      ((this._flags & CellFlag.FlippedHorizontally ? 1 : 0) << 2) |
      ((this._flags & CellFlag.FlippedVertically ? 1 : 0) << 1) |
      (this._flags & CellFlag.FlippedAntiDiagonally ? 1 : 0);
    const mask = tables[direction]![idx]!;
    this.setFlippedHorizontally((mask & 4) !== 0);
    this.setFlippedVertically((mask & 2) !== 0);
    this.setFlippedAntiDiagonally((mask & 1) !== 0);
  }
}
