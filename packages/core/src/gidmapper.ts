// Port of libtiled/gidmapper.h+cpp.
//
// We only port the in-memory `gidToCell` / `cellToGid` translation here.
// `encodeLayerData` / `decodeLayerData` (which deal with base64/zlib/gzip/csv
// payloads) live in `@tiled-ts/format`, where the Node/browser-flavoured
// encoders are pulled in.

import { Cell, CellFlag } from './cell.js';
import type { Tileset } from './tileset.js';

/** Top three bits of a TMX gid carry the tile-flip flags. */
export const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
export const FLIPPED_VERTICALLY_FLAG = 0x40000000;
export const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
export const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;
export const ALL_FLIP_FLAGS =
  FLIPPED_HORIZONTALLY_FLAG |
  FLIPPED_VERTICALLY_FLAG |
  FLIPPED_DIAGONALLY_FLAG |
  ROTATED_HEXAGONAL_120_FLAG;

export interface GidMapperEntry {
  firstGid: number;
  tileset: Tileset;
}

export class GidMapper {
  private entries: GidMapperEntry[] = [];
  invalidTile = 0;

  constructor(tilesets?: readonly Tileset[]) {
    if (tilesets) {
      let g = 1;
      for (const t of tilesets) {
        this.entries.push({ firstGid: g, tileset: t });
        g += t.nextTileId; // upstream uses tileCount; nextTileId aligns when tiles are out-of-order
      }
    }
  }

  insert(firstGid: number, tileset: Tileset): void {
    this.entries.push({ firstGid, tileset });
    this.entries.sort((a, b) => b.firstGid - a.firstGid);
  }

  clear(): void {
    this.entries = [];
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** Convert a TMX 32-bit gid to a `Cell`. Returns `{ ok: false }` if the
   *  gid is non-empty but no matching tileset is known. */
  gidToCell(gid: number): { cell: Cell; ok: boolean } {
    const flags = gid & ALL_FLIP_FLAGS;
    const id = gid & ~ALL_FLIP_FLAGS;

    if (id === 0) {
      const empty = new Cell();
      return { cell: empty, ok: true };
    }

    for (const e of this.entries) {
      if (id >= e.firstGid) {
        const cell = new Cell(e.tileset, id - e.firstGid);
        if (flags & FLIPPED_HORIZONTALLY_FLAG) cell.setFlippedHorizontally(true);
        if (flags & FLIPPED_VERTICALLY_FLAG) cell.setFlippedVertically(true);
        if (flags & FLIPPED_DIAGONALLY_FLAG) cell.setFlippedAntiDiagonally(true);
        if (flags & ROTATED_HEXAGONAL_120_FLAG) cell.setRotatedHexagonal120(true);
        return { cell, ok: true };
      }
    }

    this.invalidTile = id >>> 0;
    return { cell: new Cell(), ok: false };
  }

  /** Convert a `Cell` back to its 32-bit TMX gid representation. */
  cellToGid(cell: Cell): number {
    if (cell.isEmpty() || !cell.tileset) return 0;
    let gid = 0;
    for (const e of this.entries) {
      if (cell.tileset === e.tileset) {
        gid = e.firstGid + cell.tileId;
        break;
      }
    }
    if (cell.rawFlags & CellFlag.FlippedHorizontally) gid |= FLIPPED_HORIZONTALLY_FLAG;
    if (cell.rawFlags & CellFlag.FlippedVertically) gid |= FLIPPED_VERTICALLY_FLAG;
    if (cell.rawFlags & CellFlag.FlippedAntiDiagonally) gid |= FLIPPED_DIAGONALLY_FLAG;
    if (cell.rawFlags & CellFlag.RotatedHexagonal120) gid |= ROTATED_HEXAGONAL_120_FLAG;
    return gid >>> 0;
  }
}
