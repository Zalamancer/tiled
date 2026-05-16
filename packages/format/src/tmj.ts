// TMJ (Tiled JSON map) reader + writer.
//
// Faithful subset of `MapToVariantConverter` / `VariantToMapConverter`. We
// stick to the on-disk shape Tiled writes today (version "1.10") so files
// loaded here also load in the upstream editor.

import {
  Cell,
  GidMapper,
  GroupLayer,
  ImageLayer,
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  Tile,
  TileLayer,
  TileRegion,
  Tileset,
  TilesetOrientation,
  WangColor,
  WangId,
  WangSet,
  CellFlag,
  LayerDataFormat,
  LoadingStatus,
  drawOrderToString,
  drawOrderFromString,
  orientationFromString,
  orientationToString,
  renderOrderFromString,
  renderOrderToString,
  staggerAxisFromString,
  staggerAxisToString,
  staggerIndexFromString,
  staggerIndexToString,
  tilesetOrientationFromString,
  tilesetOrientationToString,
  wangSetTypeFromString,
  wangSetTypeToString,
} from '@tiled-ts/core';
import type { Layer, Properties } from '@tiled-ts/core';

import { decodeGids, encodeGids } from './compression.js';
import { propertiesFromJson, propertiesToJson } from './propertiesJson.js';

const TILED_VERSION = '1.10.0';
const TMJ_VERSION = '1.10';

/* ──────────────────────────── writer ─────────────────────────────────── */

export function writeMapJson(map: TiledMap): unknown {
  const gm = new GidMapper();
  let firstGid = 1;
  for (const ts of map.tilesets) {
    gm.insert(firstGid, ts);
    firstGid += Math.max(ts.nextTileId, ts.tileCount + 1);
  }

  const out: Record<string, unknown> = {
    type: 'map',
    version: TMJ_VERSION,
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
  if (map.staggerAxis !== undefined && (map.orientation === 4 || map.orientation === 3)) {
    out.staggeraxis = staggerAxisToString(map.staggerAxis);
    out.staggerindex = staggerIndexToString(map.staggerIndex);
  }
  if (map.orientation === 4) out.hexsidelength = map.hexSideLength;
  if (map.parameters.skewX) out.skewx = map.parameters.skewX;
  if (map.parameters.skewY) out.skewy = map.parameters.skewY;
  if (map.properties.size > 0) out.properties = propertiesToJson(map.properties);

  const tilesets: unknown[] = [];
  let g = 1;
  for (const ts of map.tilesets) {
    const tsObj = writeTilesetJson(ts) as Record<string, unknown>;
    tilesets.push({ firstgid: g, ...tsObj });
    g += Math.max(ts.nextTileId, ts.tileCount + 1);
  }
  out.tilesets = tilesets;

  out.layers = map.layers.map((l) => writeLayerJson(l, gm, map));

  return out;
}

function writeLayerJson(layer: Layer, gm: GidMapper, map: TiledMap): unknown {
  const base: Record<string, unknown> = {
    id: layer.id,
    name: layer.name,
    x: layer.x,
    y: layer.y,
    visible: layer.visible,
    opacity: layer.opacity,
  };
  if (layer.locked) base.locked = true;
  if (layer.className) base.class = layer.className;
  if (layer.tintColor) base.tintcolor = layer.tintColor;
  if (layer.parallaxFactor.x !== 1) base.parallaxx = layer.parallaxFactor.x;
  if (layer.parallaxFactor.y !== 1) base.parallaxy = layer.parallaxFactor.y;
  if (layer.offset.x) base.offsetx = layer.offset.x;
  if (layer.offset.y) base.offsety = layer.offset.y;
  if (layer.properties.size > 0) base.properties = propertiesToJson(layer.properties);

  if (layer.isTileLayer()) {
    const tl = layer as TileLayer;
    const w = tl.width;
    const h = tl.height;
    const gids = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = tl.cellAt(x, y);
        gids[y * w + x] = gm.cellToGid(c);
      }
    }
    const fmt = map.layerDataFormat;
    const data =
      fmt === LayerDataFormat.CSV || fmt === LayerDataFormat.XML
        ? Array.from(gids)
        : encodeGids(gids, fmt, map.compressionLevel);
    return {
      type: 'tilelayer',
      ...base,
      width: w,
      height: h,
      ...(fmt === LayerDataFormat.XML
        ? { encoding: 'csv', data: Array.from(gids) }
        : fmt === LayerDataFormat.CSV
          ? { encoding: 'csv', data }
          : { encoding: 'base64', compression: layerDataFormatCompressionString(fmt), data }),
    };
  }

  if (layer.isObjectGroup()) {
    const og = layer as ObjectGroup;
    return {
      type: 'objectgroup',
      ...base,
      draworder: drawOrderToString(og.drawOrder),
      objects: og.objects.map((o) => writeObjectJson(o, gm)),
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
      ...(il.repeatX ? { repeatx: true } : {}),
      ...(il.repeatY ? { repeaty: true } : {}),
    };
  }

  if (layer.isGroupLayer()) {
    const gl = layer as GroupLayer;
    return {
      type: 'group',
      ...base,
      layers: gl.layers.map((l) => writeLayerJson(l, gm, map)),
    };
  }

  return base;
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
function compressionStringToFormat(s: string | undefined): LayerDataFormat {
  switch (s) {
    case 'gzip':
      return LayerDataFormat.Base64Gzip;
    case 'zlib':
      return LayerDataFormat.Base64Zlib;
    case 'zstd':
      return LayerDataFormat.Base64Zstandard;
    default:
      return LayerDataFormat.Base64;
  }
}

function writeObjectJson(o: MapObject, gm: GidMapper): unknown {
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
  else if (o.shape === MapObjectShape.Polygon) out.polygon = o.polygon.map((p) => ({ x: p.x, y: p.y }));
  else if (o.shape === MapObjectShape.Polyline) out.polyline = o.polygon.map((p) => ({ x: p.x, y: p.y }));
  else if (o.shape === MapObjectShape.Text) out.text = serializeText(o);

  if (!o.cell.isEmpty()) out.gid = gm.cellToGid(o.cell);

  if (o.properties.size > 0) out.properties = propertiesToJson(o.properties);

  return out;
}

function serializeText(o: MapObject): unknown {
  return {
    text: o.textData.text,
    color: o.textData.color,
    halign: o.textData.horizontalAlignment,
    valign: o.textData.verticalAlignment,
    wrap: o.textData.wordWrap,
    fontfamily: o.textData.font.family,
    pixelsize: o.textData.font.pixelSize,
    bold: o.textData.font.bold,
    italic: o.textData.font.italic,
    underline: o.textData.font.underline,
    strikeout: o.textData.font.strikeOut,
    kerning: o.textData.font.kerning,
  };
}

export function writeTilesetJson(ts: Tileset): unknown {
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
  if (ts.backgroundColor) out.backgroundcolor = ts.backgroundColor;
  if (ts.imageReference.source) {
    out.image = ts.imageReference.source;
    out.imagewidth = ts.imageReference.size.width;
    out.imageheight = ts.imageReference.size.height;
  }
  if (ts.transparentColor) out.transparentcolor = ts.transparentColor;
  if (ts.tileOffset.x || ts.tileOffset.y) {
    out.tileoffset = { x: ts.tileOffset.x, y: ts.tileOffset.y };
  }
  if (ts.orientation !== TilesetOrientation.Orthogonal) {
    out.grid = { orientation: tilesetOrientationToString(ts.orientation), width: ts.gridSize.width, height: ts.gridSize.height };
  }
  if (ts.transformationFlags) {
    out.transformations = {
      hflip: Boolean(ts.transformationFlags & 0x1),
      vflip: Boolean(ts.transformationFlags & 0x2),
      rotate: Boolean(ts.transformationFlags & 0x4),
      preferuntransformed: Boolean(ts.transformationFlags & 0x8),
    };
  }

  // Per-tile metadata (animations, properties, tile-class, terrain).
  const customTiles: unknown[] = [];
  for (const tile of ts.tiles) {
    const tj: Record<string, unknown> = { id: tile.id };
    if (tile.className) tj.type = tile.className;
    if (tile.probability !== 1) tj.probability = tile.probability;
    if (tile.frames.length > 0) tj.animation = tile.frames.map((f) => ({ tileid: f.tileId, duration: f.duration }));
    if (tile.imageSource) {
      tj.image = tile.imageSource;
      tj.imagewidth = tile.imageRect.width;
      tj.imageheight = tile.imageRect.height;
    }
    if (tile.properties.size > 0) tj.properties = propertiesToJson(tile.properties);
    if (Object.keys(tj).length > 1) customTiles.push(tj);
  }
  if (customTiles.length) out.tiles = customTiles;

  // WangSets
  if (ts.wangSetCount > 0) {
    const wangsets: unknown[] = [];
    for (const ws of ts.wangSets) {
      const wj: Record<string, unknown> = {
        name: ws.name,
        type: wangSetTypeToString(ws.type),
        tile: ws.imageTileId,
        colors: ws.colors().map((c: WangColor) => ({
          name: c.name,
          color: c.color,
          tile: c.imageId,
          probability: c.probability,
          ...(c.className ? { class: c.className } : {}),
          ...(c.properties.size > 0 ? { properties: propertiesToJson(c.properties) } : {}),
        })),
        wangtiles: Array.from(ws.wangIdByTileId(), ([tileId, wangId]) => ({
          tileid: tileId,
          wangid: serializeWangId(wangId),
        })),
      };
      if (ws.className) wj.class = ws.className;
      if (ws.properties.size > 0) wj.properties = propertiesToJson(ws.properties);
      wangsets.push(wj);
    }
    out.wangsets = wangsets;
  }

  if (ts.properties.size > 0) out.properties = propertiesToJson(ts.properties);
  return out;
}

function serializeWangId(id: WangId): number[] {
  const out: number[] = [];
  for (let i = 0; i < WangId.NumIndexes; i++) out.push(id.indexColor(i));
  return out;
}

/* ──────────────────────────── reader ─────────────────────────────────── */

export function readMapJson(json: unknown): TiledMap {
  if (typeof json !== 'object' || json === null) throw new Error('expected object');
  const m = json as Record<string, unknown>;

  const map = new TiledMap({
    orientation: orientationFromString(String(m.orientation ?? 'orthogonal')),
    renderOrder: renderOrderFromString(String(m.renderorder ?? 'right-down')),
    width: Number(m.width ?? 0),
    height: Number(m.height ?? 0),
    tileWidth: Number(m.tilewidth ?? 0),
    tileHeight: Number(m.tileheight ?? 0),
    infinite: Boolean(m.infinite),
    hexSideLength: Number(m.hexsidelength ?? 0),
    staggerAxis: m.staggeraxis ? staggerAxisFromString(String(m.staggeraxis)) : undefined,
    staggerIndex: m.staggerindex ? staggerIndexFromString(String(m.staggerindex)) : undefined,
    skewX: Number(m.skewx ?? 0),
    skewY: Number(m.skewy ?? 0),
    backgroundColor: typeof m.backgroundcolor === 'string' ? m.backgroundcolor : undefined,
  });

  if (typeof m.class === 'string') map.setClassName(m.class);
  if (typeof m.compressionlevel === 'number') map.setCompressionLevel(m.compressionlevel);
  if (typeof m.nextlayerid === 'number') map.setNextLayerId(m.nextlayerid);
  if (typeof m.nextobjectid === 'number') map.setNextObjectId(m.nextobjectid);
  if (Array.isArray(m.properties)) map.setProperties(propertiesFromJson(m.properties as never));

  const gm = new GidMapper();
  if (Array.isArray(m.tilesets)) {
    for (const tj of m.tilesets) {
      const t = tj as Record<string, unknown>;
      const firstGid = Number(t.firstgid ?? 1);
      const ts = readTilesetJson(t);
      map.addTileset(ts);
      gm.insert(firstGid, ts);
    }
  }

  if (Array.isArray(m.layers)) {
    for (const lj of m.layers) map.addLayer(readLayerJson(lj as Record<string, unknown>, gm));
  }

  return map;
}

function readLayerJson(j: Record<string, unknown>, gm: GidMapper): Layer {
  const type = String(j.type ?? 'tilelayer');
  if (type === 'tilelayer') {
    const w = Number(j.width ?? 0);
    const h = Number(j.height ?? 0);
    const tl = new TileLayer(String(j.name ?? ''), Number(j.x ?? 0), Number(j.y ?? 0), w, h);
    applyLayerCommon(tl, j);
    const encoding = String(j.encoding ?? 'csv');
    let gids: Uint32Array;
    if (encoding === 'csv') {
      const arr = Array.isArray(j.data) ? (j.data as number[]) : [];
      gids = Uint32Array.from(arr.map((n) => n >>> 0));
    } else {
      const fmt = compressionStringToFormat(j.compression as string | undefined);
      gids = decodeGids(String(j.data ?? ''), fmt);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gid = gids[y * w + x] ?? 0;
        const { cell } = gm.gidToCell(gid);
        if (!cell.isEmpty()) tl.setCell(x, y, cell);
      }
    }
    return tl;
  }
  if (type === 'objectgroup') {
    const og = new ObjectGroup(String(j.name ?? ''), Number(j.x ?? 0), Number(j.y ?? 0));
    applyLayerCommon(og, j);
    og.drawOrder = drawOrderFromString(String(j.draworder ?? 'topdown'));
    if (typeof j.color === 'string') og.color = j.color;
    if (Array.isArray(j.objects)) {
      for (const oj of j.objects) og.addObject(readObjectJson(oj as Record<string, unknown>, gm));
    }
    return og;
  }
  if (type === 'imagelayer') {
    const il = new ImageLayer(String(j.name ?? ''), Number(j.x ?? 0), Number(j.y ?? 0));
    applyLayerCommon(il, j);
    il.imageSource = String(j.image ?? '');
    if (typeof j.transparentcolor === 'string') il.transparentColor = j.transparentcolor;
    if (j.repeatx) il.setRepeatX(true);
    if (j.repeaty) il.setRepeatY(true);
    return il;
  }
  if (type === 'group') {
    const gl = new GroupLayer(String(j.name ?? ''), Number(j.x ?? 0), Number(j.y ?? 0));
    applyLayerCommon(gl, j);
    if (Array.isArray(j.layers)) for (const c of j.layers) gl.addLayer(readLayerJson(c as Record<string, unknown>, gm));
    return gl;
  }
  throw new Error(`unknown layer type: ${type}`);
}

function applyLayerCommon(layer: Layer, j: Record<string, unknown>): void {
  if (typeof j.id === 'number') layer.id = j.id;
  if (typeof j.opacity === 'number') layer.opacity = j.opacity;
  if (typeof j.visible === 'boolean') layer.visible = j.visible;
  if (typeof j.locked === 'boolean') layer.locked = j.locked;
  if (typeof j.class === 'string') layer.setClassName(j.class);
  if (typeof j.tintcolor === 'string') layer.tintColor = j.tintcolor;
  if (typeof j.offsetx === 'number' || typeof j.offsety === 'number') {
    layer.offset = { x: Number(j.offsetx ?? 0), y: Number(j.offsety ?? 0) };
  }
  if (typeof j.parallaxx === 'number' || typeof j.parallaxy === 'number') {
    layer.parallaxFactor = { x: Number(j.parallaxx ?? 1), y: Number(j.parallaxy ?? 1) };
  }
  if (Array.isArray(j.properties)) layer.setProperties(propertiesFromJson(j.properties as never));
}

function readObjectJson(j: Record<string, unknown>, gm: GidMapper): MapObject {
  const o = new MapObject(
    String(j.name ?? ''),
    String(j.type ?? ''),
    { x: Number(j.x ?? 0), y: Number(j.y ?? 0) },
    { width: Number(j.width ?? 0), height: Number(j.height ?? 0) },
  );
  if (typeof j.id === 'number') o.setId(j.id);
  if (typeof j.rotation === 'number') o.rotation = j.rotation;
  if (typeof j.visible === 'boolean') o.visible = j.visible;
  if (j.point === true) o.setShape(MapObjectShape.Point);
  if (j.ellipse === true) o.setShape(MapObjectShape.Ellipse);
  if (Array.isArray(j.polygon)) {
    o.setShape(MapObjectShape.Polygon);
    o.setPolygon((j.polygon as { x: number; y: number }[]).map((p) => ({ x: p.x, y: p.y })));
  }
  if (Array.isArray(j.polyline)) {
    o.setShape(MapObjectShape.Polyline);
    o.setPolygon((j.polyline as { x: number; y: number }[]).map((p) => ({ x: p.x, y: p.y })));
  }
  if (j.text) {
    o.setShape(MapObjectShape.Text);
    const t = j.text as Record<string, unknown>;
    o.setTextData({
      text: String(t.text ?? ''),
      color: String(t.color ?? '#000000'),
      horizontalAlignment: (t.halign as 'left' | 'center' | 'right' | 'justify') ?? 'left',
      verticalAlignment: (t.valign as 'top' | 'center' | 'bottom') ?? 'top',
      wordWrap: Boolean(t.wrap ?? true),
      font: {
        family: String(t.fontfamily ?? 'sans-serif'),
        pixelSize: Number(t.pixelsize ?? 16),
        bold: Boolean(t.bold),
        italic: Boolean(t.italic),
        underline: Boolean(t.underline),
        strikeOut: Boolean(t.strikeout),
        kerning: Boolean(t.kerning ?? true),
      },
    });
  }
  if (typeof j.gid === 'number') {
    const { cell } = gm.gidToCell(j.gid >>> 0);
    o.setCell(cell);
  }
  if (Array.isArray(j.properties)) o.setProperties(propertiesFromJson(j.properties as never));
  return o;
}

export function readTilesetJson(j: Record<string, unknown>): Tileset {
  const ts = new Tileset(
    String(j.name ?? ''),
    Number(j.tilewidth ?? 0),
    Number(j.tileheight ?? 0),
    Number(j.spacing ?? 0),
    Number(j.margin ?? 0),
  );
  if (typeof j.class === 'string') ts.setClassName(j.class);
  if (typeof j.backgroundcolor === 'string') ts.backgroundColor = j.backgroundcolor;
  if (typeof j.image === 'string') {
    ts.imageReference.source = j.image;
    ts.imageReference.size = {
      width: Number(j.imagewidth ?? 0),
      height: Number(j.imageheight ?? 0),
    };
    ts.imageReference.status = LoadingStatus.LoadingPending;
  }
  if (typeof j.transparentcolor === 'string') ts.setTransparentColor(j.transparentcolor);
  if (typeof j.columns === 'number') ts.setColumnCount(j.columns);
  if (j.tileoffset) {
    const t = j.tileoffset as { x?: number; y?: number };
    ts.tileOffset = { x: Number(t.x ?? 0), y: Number(t.y ?? 0) };
  }
  if (j.grid) {
    const g = j.grid as { orientation?: string; width?: number; height?: number };
    ts.orientation = tilesetOrientationFromString(String(g.orientation ?? 'orthogonal'));
    ts.gridSize = { width: Number(g.width ?? 0), height: Number(g.height ?? 0) };
  }
  if (j.transformations) {
    const t = j.transformations as { hflip?: boolean; vflip?: boolean; rotate?: boolean; preferuntransformed?: boolean };
    ts.transformationFlags =
      (t.hflip ? 0x1 : 0) | (t.vflip ? 0x2 : 0) | (t.rotate ? 0x4 : 0) | (t.preferuntransformed ? 0x8 : 0);
  }

  if (Array.isArray(j.tiles)) {
    for (const tj of j.tiles) {
      const t = tj as Record<string, unknown>;
      const id = Number(t.id);
      const tile = ts.findOrCreateTile(id);
      if (typeof t.type === 'string') tile.setType(t.type);
      if (typeof t.probability === 'number') tile.probability = t.probability;
      if (typeof t.image === 'string') {
        tile.imageSource = t.image;
        tile.imageRect = { x: 0, y: 0, width: Number(t.imagewidth ?? 0), height: Number(t.imageheight ?? 0) };
      }
      if (Array.isArray(t.animation)) {
        tile.setFrames((t.animation as { tileid: number; duration: number }[]).map((f) => ({ tileId: f.tileid, duration: f.duration })));
      }
      if (Array.isArray(t.properties)) tile.setProperties(propertiesFromJson(t.properties as never));
    }
  }

  if (Array.isArray(j.wangsets)) {
    for (const wj of j.wangsets) {
      const w = wj as Record<string, unknown>;
      const ws = new WangSet(
        ts,
        String(w.name ?? ''),
        wangSetTypeFromString(String(w.type ?? 'mixed')),
        Number(w.tile ?? -1),
      );
      if (typeof w.class === 'string') ws.setClassName(w.class);
      if (Array.isArray(w.colors)) {
        for (const cj of w.colors) {
          const c = cj as Record<string, unknown>;
          const color = new WangColor(
            ws.colorCount() + 1,
            String(c.name ?? ''),
            String(c.color ?? '#ff0000'),
            Number(c.tile ?? -1),
            Number(c.probability ?? 1),
          );
          if (typeof c.class === 'string') color.setClassName(c.class);
          if (Array.isArray(c.properties)) color.setProperties(propertiesFromJson(c.properties as never));
          ws.addWangColor(color);
        }
      }
      if (Array.isArray(w.wangtiles)) {
        for (const wt of w.wangtiles) {
          const t = wt as { tileid: number; wangid: number[] };
          const id = new WangId();
          for (let i = 0; i < t.wangid.length; i++) id.setIndexColor(i, t.wangid[i] ?? 0);
          ws.setWangId(t.tileid, id);
        }
      }
      if (Array.isArray(w.properties)) ws.setProperties(propertiesFromJson(w.properties as never));
      ts.addWangSet(ws);
    }
  }

  if (Array.isArray(j.properties)) ts.setProperties(propertiesFromJson(j.properties as never));
  return ts;
}

// Unused but exported to demonstrate the API surface.
export { Cell, CellFlag, GidMapper, TileRegion, Tile, Tileset };
export type { Properties };
