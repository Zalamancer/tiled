// Port of `Defold::DefoldPlugin` from src/plugins/defold/defoldplugin.cpp.
//
// Defold's `.tilemap` text format is a Google-protobuf textproto. The Tiled
// plugin emits a minimal subset:
//
//   tile_set: "…"
//   layers { id: "Background" z: 0.0001 is_visible: 1
//     cell { x: 0 y: 4 tile: 7 h_flip: 0 v_flip: 0 rotate90: 0 }
//     …
//   }
//   material: "/builtins/materials/tile_map.material"
//   blend_mode: BLEND_MODE_ALPHA
//
// Defold's Y axis grows upward, so we mirror cells vertically (y → height-1-y).
// Flip flags are encoded the same way upstream does: anti-diagonal cells map
// to `rotate90 = 1` and re-derive h_flip/v_flip from the Tiled flag table.

import {
  type Cell,
  type Map as TiledMap,
  type TileLayer,
  type TiledObject,
} from '@tiled-ts/core';

import { FormatCapability, type FileFormat } from './formatRegistry.js';

export function writeDefold(map: TiledMap): string {
  const tileSet = stringProperty(map, 'tile_set', '');

  const parts: string[] = [];
  parts.push(`tile_set: ${JSON.stringify(tileSet)}\n`);

  let zBase = 0;
  for (const layer of map.tileLayers()) {
    zBase += 0.0001;
    const z = numberProperty(layer, 'z', zBase);
    parts.push(writeLayer(layer, z));
  }

  parts.push(`material: ${JSON.stringify('/builtins/materials/tile_map.material')}\n`);
  parts.push('blend_mode: BLEND_MODE_ALPHA\n');
  return parts.join('');
}

function writeLayer(layer: TileLayer, z: number): string {
  const cellLines: string[] = [];
  for (let x = 0; x < layer.width; x++) {
    for (let y = 0; y < layer.height; y++) {
      const cell = layer.cellAt(x, y);
      if (cell.isEmpty()) continue;
      cellLines.push(formatCell(x, layer.height - y - 1, cell));
    }
  }
  return [
    'layers {\n',
    `  id: ${JSON.stringify(layer.name)}\n`,
    `  z: ${z}\n`,
    `  is_visible: ${layer.visible ? 1 : 0}\n`,
    ...cellLines,
    '}\n',
  ].join('');
}

function formatCell(x: number, y: number, cell: Cell): string {
  let hFlip = cell.flippedHorizontally() ? 1 : 0;
  let vFlip = cell.flippedVertically() ? 1 : 0;
  let rotate90 = 0;
  if (cell.flippedAntiDiagonally()) {
    hFlip = cell.flippedVertically() ? 1 : 0;
    vFlip = cell.flippedHorizontally() ? 0 : 1;
    rotate90 = 1;
  }
  return [
    '  cell {\n',
    `    x: ${x}\n`,
    `    y: ${y}\n`,
    `    tile: ${cell.tileId}\n`,
    `    h_flip: ${hFlip}\n`,
    `    v_flip: ${vFlip}\n`,
    `    rotate90: ${rotate90}\n`,
    '  }\n',
  ].join('');
}

function stringProperty(obj: TiledObject, name: string, def: string): string {
  const v = obj.property(name);
  if (!v) return def;
  if (v.kind === 'string' || v.kind === 'color') return String(v.value ?? '');
  if (v.kind === 'file') return v.url;
  return def;
}

function numberProperty(obj: TiledObject, name: string, def: number): number {
  const v = obj.property(name);
  if (!v) return def;
  if (v.kind === 'int' || v.kind === 'float') return v.value;
  return def;
}

/* ─────────────────────────── plugin descriptor ────────────────────────────── */

export const defoldPlugin: FileFormat = {
  id: 'defold',
  name: 'Defold Tile Map',
  extension: 'tilemap',
  capabilities: FormatCapability.Write,
  write(map) {
    return { 'map.tilemap': writeDefold(map) };
  },
};
