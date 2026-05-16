// Minimal port of `Yy::YyPlugin` from src/plugins/yy/yyplugin.cpp.
//
// GameMaker Studio 2 rooms are JSON files (`.yy`) with a deeply nested
// `GMRoom` resource hierarchy. This port emits the *skeleton* of a single
// room — name, room settings, an empty `views` array and a list of
// `GMRTileLayer` entries for each Tiled tile layer. Object/instance
// emission and the full GMR resource graph are out of scope. See TODOs.

import { type Map as TiledMap, type TileLayer } from '@tiled-ts/core';

import { FormatCapability, type FileFormat } from './formatRegistry.js';

const RESOURCE_VERSION = '2.0';

export function writeYy(map: TiledMap, roomName = 'tiled_room'): string {
  const layers = Array.from(map.tileLayers());
  const json: Record<string, unknown> = {
    $GMRoom: 'v1',
    '%Name': roomName,
    name: roomName,
    resourceVersion: '1.0',
    resourceType: 'GMRoom',
    isDnd: false,
    volume: 1,
    parentRoom: null,
    views: defaultViews(),
    layers: layers.map((l, i) => writeTileLayerYy(map, l, i)),
    inheritLayers: false,
    creationCodeFile: '',
    inheritCode: false,
    instanceCreationOrder: [],
    inheritCreationOrder: false,
    sequenceId: null,
    roomSettings: {
      inheritRoomSettings: false,
      Width: map.tileWidth * map.width,
      Height: map.tileHeight * map.height,
      persistent: false,
    },
    viewSettings: {
      inheritViewSettings: false,
      enableViews: false,
      clearViewBackground: false,
      clearDisplayBuffer: true,
    },
    physicsSettings: {
      inheritPhysicsSettings: false,
      PhysicsWorld: false,
      PhysicsWorldGravityX: 0,
      PhysicsWorldGravityY: 10,
      PhysicsWorldPixToMetres: 0.1,
    },
    parent: {
      name: 'Rooms',
      path: 'folders/Rooms.yy',
    },
    tags: [],
    // TODO: emit tileset (GMRTileLayer.tilesetId) resources, instances,
    // backgrounds, sprite graphics and overridden properties.
  };
  return JSON.stringify(json, null, 4);
}

function defaultViews(): unknown[] {
  // GMS2 rooms always declare 8 views. We emit them invisible/inherited.
  const out: unknown[] = [];
  for (let i = 0; i < 8; i++) {
    out.push({
      inherit: false,
      visible: false,
      xview: 0,
      yview: 0,
      wview: 1024,
      hview: 768,
      xport: 0,
      yport: 0,
      wport: 1024,
      hport: 768,
      hborder: 32,
      vborder: 32,
      hspeed: -1,
      vspeed: -1,
      objectId: null,
    });
  }
  return out;
}

function writeTileLayerYy(_map: TiledMap, tl: TileLayer, index: number): unknown {
  const w = tl.width;
  const h = tl.height;
  const data: number[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = tl.cellAt(x, y);
      data[y * w + x] = cell.isEmpty() ? 0 : cell.tileId >>> 0;
    }
  }

  return {
    $GMRTileLayer: '',
    '%Name': sanitizeName(tl.name),
    resourceType: 'GMRTileLayer',
    resourceVersion: RESOURCE_VERSION,
    name: sanitizeName(tl.name),
    depth: 100 * (index + 1),
    effectEnabled: true,
    effectType: null,
    gridX: 32,
    gridY: 32,
    hierarchyFrozen: false,
    hierarchyVisible: tl.visible,
    inheritLayerDepth: false,
    inheritLayerSettings: false,
    inheritSubLayers: true,
    inheritVisibility: true,
    layers: [],
    properties: [],
    userdefinedDepth: false,
    visible: tl.visible,
    // TODO: tilesetId must reference a real GMS tileset resource. We leave
    // it null so consumers can patch it post-export.
    tilesetId: null,
    x: tl.x,
    y: tl.y,
    tiles: {
      SerialiseWidth: w,
      SerialiseHeight: h,
      TileSerialiseData: data,
    },
  };
}

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '_') || 'layer';
}

/* ─────────────────────────── plugin descriptor ────────────────────────────── */

export const yyPlugin: FileFormat = {
  id: 'yy',
  name: 'GameMaker Studio 2 room',
  extension: 'yy',
  capabilities: FormatCapability.Write,
  write(map) {
    return { 'room.yy': writeYy(map) };
  },
};
