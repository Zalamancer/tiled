// Port of `Csv::CsvPlugin` from src/plugins/csv/csvplugin.cpp.
//
// Each tile layer is exported to its own `.csv` payload. Cells are
// comma-separated within a row and newline-separated between rows. The
// numeric value for each cell follows Tiled's TMX gid encoding — the top
// three bits carry the flip flags — so the output is byte-compatible with
// the upstream C++ plugin.
//
// Tiles that carry a `name` custom property emit the property value instead
// of a numeric id, matching the upstream behaviour. Empty cells emit `-1`.

import {
  Cell,
  CellFlag,
  type Map as TiledMap,
  TileLayer,
  type Tileset,
} from '@tiled-ts/core';

import { FormatCapability, type FileFormat } from './formatRegistry.js';

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_ANTI_DIAGONALLY_FLAG = 0x20000000;
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;

/**
 * Write each tile layer of `map` to its own CSV payload.
 *
 * The returned record is keyed by suggested file name (matching the C++
 * plugin's `outputFiles` logic): when the map has more than one tile layer
 * each filename is `<base>_<layerName>.csv`, where any path-reserved chars
 * in the layer name are replaced with `_`. When there is a single tile
 * layer the key is just `<base>.csv` to keep behaviour backwards-compatible.
 */
export function writeCsv(map: TiledMap, baseName = 'map'): Record<string, string> {
  const out: Record<string, string> = {};
  const layers: TileLayer[] = Array.from(map.tileLayers());

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    const payload = writeLayerCsv(map, layer);
    const key = layers.length === 1 ? `${baseName}.csv` : `${baseName}_${sanitize(layer.name)}.csv`;
    out[key] = payload;
  }

  return out;
}

/** Encode a single tile layer as CSV (no trailing newline after the last row). */
export function writeLayerCsv(map: TiledMap, layer: TileLayer): string {
  const bounds = map.infinite
    ? layer.region().boundingRect()
    : { x: 0, y: 0, width: layer.width, height: layer.height };

  const rows: string[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    const cells: string[] = [];
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const cell = layer.cellAt(x, y);
      cells.push(encodeCell(cell));
    }
    rows.push(cells.join(','));
  }
  // Upstream writes a trailing '\n' after every row, including the last one.
  return rows.length > 0 ? rows.join('\n') + '\n' : '';
}

function encodeCell(cell: Cell): string {
  // Tiles with a `name` property serialise to that property value.
  if (cell.tileset) {
    const tile = cell.tile();
    const nameProp = tile?.property('name');
    if (nameProp && nameProp.kind === 'string') return nameProp.value;
  }

  if (cell.isEmpty()) return '-1';

  let id = cell.tileId >>> 0;
  if (cell.rawFlags & CellFlag.FlippedHorizontally) id = (id | FLIPPED_HORIZONTALLY_FLAG) >>> 0;
  if (cell.rawFlags & CellFlag.FlippedVertically) id = (id | FLIPPED_VERTICALLY_FLAG) >>> 0;
  if (cell.rawFlags & CellFlag.FlippedAntiDiagonally) id = (id | FLIPPED_ANTI_DIAGONALLY_FLAG) >>> 0;
  if (cell.rawFlags & CellFlag.RotatedHexagonal120) id = (id | ROTATED_HEXAGONAL_120_FLAG) >>> 0;

  // Match the C++ writer which serialises via `QByteArray::number(int)` — so
  // values with the high bit set are printed as their *signed* 32-bit form.
  // For values whose top bit is unset (the common case) this matches the
  // unsigned representation.
  return signedString(id);
}

function signedString(u32: number): string {
  // Convert an unsigned 32-bit value to its signed-printed form.
  return String(u32 | 0);
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

/* ─────────────────────────── reader (single layer) ───────────────────────── */

/**
 * Parse a CSV payload back into a `TileLayer`.
 *
 * This is the inverse of `writeLayerCsv`. The C++ writer stores each cell as
 * its *local* tile id (i.e. without applying any first-gid offset), so the
 * reader takes a single `Tileset`. Flip flags are recovered from the top
 * three bits exactly as written.
 *
 * Tile-by-name cells (legacy non-numeric entries) decode to the empty cell —
 * we have no `name -> tile` index to consult.
 */
export function readLayerCsv(text: string, layerName: string, tileset: Tileset): TileLayer {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const height = lines.length;
  const width = height > 0 ? (lines[0]?.split(',').length ?? 0) : 0;

  const layer = new TileLayer(layerName, 0, 0, width, height);

  for (let y = 0; y < height; y++) {
    const cells = lines[y]!.split(',');
    for (let x = 0; x < width; x++) {
      const raw = (cells[x] ?? '-1').trim();
      if (!/^-?\d+$/.test(raw)) continue;
      const signed = parseInt(raw, 10);
      if (signed === -1) continue;
      const unsigned = signed >>> 0;
      const flags = unsigned & 0xf0000000;
      const tileId = (unsigned & 0x0fffffff) >>> 0;
      const cell = new Cell(tileset, tileId);
      if (flags & FLIPPED_HORIZONTALLY_FLAG) cell.setFlippedHorizontally(true);
      if (flags & FLIPPED_VERTICALLY_FLAG) cell.setFlippedVertically(true);
      if (flags & FLIPPED_ANTI_DIAGONALLY_FLAG) cell.setFlippedAntiDiagonally(true);
      if (flags & ROTATED_HEXAGONAL_120_FLAG) cell.setRotatedHexagonal120(true);
      layer.setCell(x, y, cell);
    }
  }
  return layer;
}

/* ─────────────────────────── plugin descriptor ────────────────────────────── */

export const csvPlugin: FileFormat = {
  id: 'csv',
  name: 'CSV files',
  extension: 'csv',
  capabilities: FormatCapability.Write,
  write(map) {
    return writeCsv(map);
  },
};

