// Simple, human-readable plain-text dump of a Tiled map. Not present in the
// C++ Tiled distribution — included here as a debugging aid and a smoke-test
// target for the format registry. The output is one section per tile layer:
//
//   == Layer "main" (4x3) ==
//     . . X .
//     . . . .
//     X . . .
//
// Each cell is `.` for empty, otherwise the tile id (0-indexed within its
// tileset). Flip flags are *not* surfaced — use the CSV plugin if you need
// the raw gid representation.

import { type Cell, type Map as TiledMap } from '@tiled-ts/core';

import { FormatCapability, type FileFormat } from './formatRegistry.js';

export function writeTxt(map: TiledMap): string {
  const lines: string[] = [];
  lines.push(`# Tiled map ${map.width}x${map.height} (tile ${map.tileWidth}x${map.tileHeight})`);

  for (const layer of map.tileLayers()) {
    lines.push('');
    lines.push(`== Layer "${layer.name}" (${layer.width}x${layer.height}) ==`);
    for (let y = 0; y < layer.height; y++) {
      const row: string[] = [];
      for (let x = 0; x < layer.width; x++) {
        row.push(renderCell(layer.cellAt(x, y)));
      }
      lines.push('  ' + row.join(' '));
    }
  }

  return lines.join('\n') + '\n';
}

function renderCell(c: Cell): string {
  if (c.isEmpty()) return '.';
  return String(c.tileId);
}

export const txtPlugin: FileFormat = {
  id: 'txt',
  name: 'Plain text dump',
  extension: 'txt',
  capabilities: FormatCapability.Write,
  write(map) {
    return { 'map.txt': writeTxt(map) };
  },
};
