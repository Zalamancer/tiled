// Port of `Json::JsonMapFormat` (subFormat = Json) from
// src/plugins/json1/jsonplugin.cpp. This is the pre-Tiled-1.2 JSON schema.
//
// Differences from the modern TMJ schema (the one in `@tiled-ts/format`):
//   • `version` is the numeric `1.1`, not the string `"1.10"`.
//   • `properties` is an object map (name → primitive value), and a sibling
//     `propertytypes` records the original Tiled type for each property.
//   • Custom property types (class, enum) cannot be represented faithfully;
//     they degrade to the underlying primitive value.
//   • Tilesets still emit a single `image` field, but no `transformations`
//     block (which was added later).
//
// Layer ordering is preserved verbatim: although the pre-1.2 editor did not
// support group layers, the C++ plugin still writes them in `layers` (the
// JSON1 output predates the introduction of group nesting *in storage*; the
// upstream plugin still handles them via the modern converter).

import {
  GidMapper,
  type GroupLayer,
  type ImageLayer,
  LayerDataFormat,
  type Layer,
  type Map as TiledMap,
  type MapObject,
  MapObjectShape,
  MapOrientation,
  type ObjectGroup,
  orientationToString,
  type Properties,
  type PropertyValue,
  renderOrderToString,
  staggerAxisToString,
  staggerIndexToString,
  type TileLayer,
  type Tileset,
  drawOrderToString,
} from '@tiled-ts/core';
import { encodeGids } from '@tiled-ts/format';

import { FormatCapability, type FileFormat } from './formatRegistry.js';

const TILED_VERSION = '1.10.0';

/**
 * Write `map` as a pre-Tiled-1.2 JSON map object (not a string — callers can
 * stringify with `JSON.stringify` as needed).
 */
export function writeMapJson1(map: TiledMap): Record<string, unknown> {
  const gm = new GidMapper();
  let firstGid = 1;
  for (const ts of map.tilesets) {
    gm.insert(firstGid, ts);
    firstGid += Math.max(ts.nextTileId, ts.tileCount + 1);
  }

  const out: Record<string, unknown> = {
    type: 'map',
    version: 1.1,
    tiledversion: TILED_VERSION,
    orientation: orientationToString(map.orientation),
    renderorder: renderOrderToString(map.renderOrder),
    width: map.width,
    height: map.height,
    tilewidth: map.tileWidth,
    tileheight: map.tileHeight,
    infinite: map.infinite,
    nextlayerid: map.nextLayerId,
    nextobjectid: map.nextObjectId,
    compressionlevel: map.compressionLevel,
  };

  if (map.className) out.class = map.className;
  if (map.backgroundColor) out.backgroundcolor = map.backgroundColor;
  if (
    map.orientation === MapOrientation.Hexagonal ||
    map.orientation === MapOrientation.Staggered
  ) {
    out.staggeraxis = staggerAxisToString(map.staggerAxis);
    out.staggerindex = staggerIndexToString(map.staggerIndex);
  }
  if (map.orientation === MapOrientation.Hexagonal) {
    out.hexsidelength = map.hexSideLength;
  }
  if (map.parameters.skewX) out.skewx = map.parameters.skewX;
  if (map.parameters.skewY) out.skewy = map.parameters.skewY;

  applyProperties(out, map.properties);

  let g = 1;
  out.tilesets = map.tilesets.map((ts) => {
    const tsObj = writeTilesetJson1(ts) as Record<string, unknown>;
    const result = { firstgid: g, ...tsObj };
    g += Math.max(ts.nextTileId, ts.tileCount + 1);
    return result;
  });

  out.layers = flattenLayers(map.layers).map((l) => writeLayerJson1(l, gm, map));

  return out;
}

/**
 * Pre-1.2 JSON had no group layers. We flatten the tree depth-first; the
 * group layer's own properties are dropped (mirroring the historical
 * behaviour of clients that pre-date the feature).
 */
function flattenLayers(layers: readonly Layer[]): Layer[] {
  const out: Layer[] = [];
  for (const l of layers) {
    if (l.isGroupLayer()) {
      out.push(...flattenLayers((l as GroupLayer).layers));
    } else {
      out.push(l);
    }
  }
  return out;
}

function writeLayerJson1(layer: Layer, gm: GidMapper, map: TiledMap): unknown {
  const base: Record<string, unknown> = {
    id: layer.id,
    name: layer.name,
    x: layer.x,
    y: layer.y,
    visible: layer.visible,
    opacity: layer.opacity,
  };
  if (layer.className) base.class = layer.className;
  if (layer.tintColor) base.tintcolor = layer.tintColor;
  if (layer.parallaxFactor.x !== 1) base.parallaxx = layer.parallaxFactor.x;
  if (layer.parallaxFactor.y !== 1) base.parallaxy = layer.parallaxFactor.y;
  if (layer.offset.x) base.offsetx = layer.offset.x;
  if (layer.offset.y) base.offsety = layer.offset.y;
  applyProperties(base, layer.properties);

  if (layer.isTileLayer()) {
    const tl = layer as TileLayer;
    const w = tl.width;
    const h = tl.height;
    const gids = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        gids[y * w + x] = gm.cellToGid(tl.cellAt(x, y));
      }
    }
    const fmt = map.layerDataFormat;
    if (fmt === LayerDataFormat.CSV || fmt === LayerDataFormat.XML) {
      return {
        type: 'tilelayer',
        ...base,
        width: w,
        height: h,
        encoding: 'csv',
        data: Array.from(gids),
      };
    }
    return {
      type: 'tilelayer',
      ...base,
      width: w,
      height: h,
      encoding: 'base64',
      compression: layerDataFormatCompressionString(fmt),
      data: encodeGids(gids, fmt, map.compressionLevel),
    };
  }

  if (layer.isObjectGroup()) {
    const og = layer as ObjectGroup;
    return {
      type: 'objectgroup',
      ...base,
      draworder: drawOrderToString(og.drawOrder),
      objects: og.objects.map((o) => writeObjectJson1(o, gm)),
      ...(og.color ? { color: og.color } : {}),
    };
  }

  if (layer.isImageLayer()) {
    const il = layer as ImageLayer;
    return {
      type: 'imagelayer',
      ...base,
      image: il.imageSource,
      ...(il.transparentColor ? { transparentcolor: il.transparentColor } : {}),
    };
  }

  return base;
}

function writeObjectJson1(o: MapObject, gm: GidMapper): unknown {
  const out: Record<string, unknown> = {
    id: o.id,
    name: o.name,
    type: o.className,
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    rotation: o.rotation,
    visible: o.visible,
  };
  if (o.shape === MapObjectShape.Ellipse) out.ellipse = true;
  else if (o.shape === MapObjectShape.Point) out.point = true;
  else if (o.shape === MapObjectShape.Polygon)
    out.polygon = o.polygon.map((p) => ({ x: p.x, y: p.y }));
  else if (o.shape === MapObjectShape.Polyline)
    out.polyline = o.polygon.map((p) => ({ x: p.x, y: p.y }));
  if (!o.cell.isEmpty()) out.gid = gm.cellToGid(o.cell);
  applyProperties(out, o.properties);
  return out;
}

function writeTilesetJson1(ts: Tileset): unknown {
  const out: Record<string, unknown> = {
    name: ts.name,
    tilewidth: ts.tileWidth,
    tileheight: ts.tileHeight,
    spacing: ts.tileSpacing,
    margin: ts.margin,
    tilecount: ts.tileCount,
    columns: ts.columnCount,
  };
  if (ts.className) out.class = ts.className;
  if (ts.imageReference.source) {
    out.image = ts.imageReference.source;
    out.imagewidth = ts.imageReference.size.width;
    out.imageheight = ts.imageReference.size.height;
  }
  if (ts.transparentColor) out.transparentcolor = ts.transparentColor;
  if (ts.tileOffset.x || ts.tileOffset.y) {
    out.tileoffset = { x: ts.tileOffset.x, y: ts.tileOffset.y };
  }
  applyProperties(out, ts.properties);

  // Per-tile data: animations, properties, type.
  const tileEntries: Record<string, unknown> = {};
  for (const tile of ts.tiles) {
    const tj: Record<string, unknown> = {};
    if (tile.className) tj.type = tile.className;
    if (tile.probability !== 1) tj.probability = tile.probability;
    if (tile.frames.length > 0) {
      tj.animation = tile.frames.map((f) => ({ tileid: f.tileId, duration: f.duration }));
    }
    if (tile.properties.size > 0) applyProperties(tj, tile.properties);
    if (Object.keys(tj).length) tileEntries[String(tile.id)] = tj;
  }
  if (Object.keys(tileEntries).length > 0) out.tiles = tileEntries;

  return out;
}

function layerDataFormatCompressionString(f: LayerDataFormat): string {
  switch (f) {
    case LayerDataFormat.Base64Gzip:
      return 'gzip';
    case LayerDataFormat.Base64Zlib:
      return 'zlib';
    case LayerDataFormat.Base64Zstandard:
      return 'zstd';
    default:
      return '';
  }
}

/**
 * Append `properties` and `propertytypes` to `target` in the legacy object
 * format. Empty property bags are skipped (matching the C++ writer).
 */
function applyProperties(target: Record<string, unknown>, props: Properties): void {
  if (props.size === 0) return;
  const map: Record<string, unknown> = {};
  const types: Record<string, string> = {};
  for (const [name, value] of props) {
    map[name] = primitiveValue(value);
    types[name] = legacyTypeName(value);
  }
  target.properties = map;
  target.propertytypes = types;
}

function primitiveValue(v: PropertyValue): unknown {
  switch (v.kind) {
    case 'string':
    case 'color':
    case 'int':
    case 'float':
    case 'bool':
      return v.value;
    case 'file':
      return v.url;
    case 'object':
      return v.id;
    case 'class':
      return Object.fromEntries(
        Array.from(v.members.entries()).map(([k, vv]) => [k, primitiveValue(vv)]),
      );
    case 'enum':
      return v.value;
  }
}

function legacyTypeName(v: PropertyValue): string {
  switch (v.kind) {
    case 'string':
      return 'string';
    case 'int':
      return 'int';
    case 'float':
      return 'float';
    case 'bool':
      return 'bool';
    case 'color':
      return 'color';
    case 'file':
      return 'file';
    case 'object':
      return 'object';
    case 'class':
      return v.typeName || 'class';
    case 'enum':
      return v.typeName || 'enum';
  }
}

/* ─────────────────────────── plugin descriptor ────────────────────────────── */

export const json1Plugin: FileFormat = {
  id: 'json1',
  name: 'JSON files (Tiled 1.1)',
  extension: 'json',
  capabilities: FormatCapability.Write,
  write(map) {
    return { 'map.json': JSON.stringify(writeMapJson1(map), null, 2) };
  },
};
