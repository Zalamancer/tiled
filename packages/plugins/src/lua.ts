// Port of `Lua::LuaPlugin` from src/plugins/lua/luaplugin.cpp.
//
// Produces a `return { … }` Lua table literal matching the structure Tiled's
// upstream Lua plugin emits. Section ordering, key spelling and value types
// are kept verbatim so files load with `dofile` into the same shape on the
// Lua side.

import {
  drawOrderFromString,
  drawOrderToString,
  GidMapper,
  GroupLayer,
  ImageLayer,
  type Layer,
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  MapOrientation,
  ObjectGroup,
  orientationFromString,
  orientationToString,
  type Properties,
  Property,
  type PropertyValue,
  renderOrderFromString,
  renderOrderToString,
  staggerAxisFromString,
  staggerAxisToString,
  staggerIndexFromString,
  staggerIndexToString,
  TileLayer,
  Tileset,
  TilesetOrientation,
} from '@tiled-ts/core';

import { FormatCapability, type FileFormat } from './formatRegistry.js';
import { LuaTableWriter } from './luaTableWriter.js';
import { type LuaTable, type LuaValue, asTable, parseLuaReturn } from './luaTableReader.js';

const TILED_VERSION = '1.10.0';
const LUA_VERSION = '5.1';

export function writeMapLua(map: TiledMap): string {
  const w = new LuaTableWriter();
  const gm = new GidMapper();

  w.writeStartDocument();
  w.writeStartReturnTable();

  w.writeKeyAndValue('version', '1.10');
  w.writeKeyAndValue('luaversion', LUA_VERSION);
  w.writeKeyAndValue('tiledversion', TILED_VERSION);
  w.writeKeyAndValue('class', map.className);

  w.writeKeyAndValue('orientation', orientationToString(map.orientation));
  w.writeKeyAndValue('renderorder', renderOrderToString(map.renderOrder));
  w.writeKeyAndValue('width', map.width);
  w.writeKeyAndValue('height', map.height);
  w.writeKeyAndValue('tilewidth', map.tileWidth);
  w.writeKeyAndValue('tileheight', map.tileHeight);
  w.writeKeyAndValue('nextlayerid', map.nextLayerId);
  w.writeKeyAndValue('nextobjectid', map.nextObjectId);

  if (map.orientation === MapOrientation.Hexagonal) {
    w.writeKeyAndValue('hexsidelength', map.hexSideLength);
  }
  if (
    map.orientation === MapOrientation.Hexagonal ||
    map.orientation === MapOrientation.Staggered
  ) {
    w.writeKeyAndValue('staggeraxis', staggerAxisToString(map.staggerAxis));
    w.writeKeyAndValue('staggerindex', staggerIndexToString(map.staggerIndex));
  }

  const po = map.parameters.parallaxOrigin;
  if (po.x !== 0 || po.y !== 0) {
    w.writeStartTable('parallaxorigin');
    w.writeKeyAndValue('x', po.x);
    w.writeKeyAndValue('y', po.y);
    w.writeEndTable();
  }

  if (map.parameters.skewX) w.writeKeyAndValue('skewx', map.parameters.skewX);
  if (map.parameters.skewY) w.writeKeyAndValue('skewy', map.parameters.skewY);

  if (map.backgroundColor) writeColor(w, 'backgroundcolor', map.backgroundColor);

  writeProperties(w, map.properties);

  // Tilesets
  w.writeStartTable('tilesets');
  let firstGid = 1;
  for (const ts of map.tilesets) {
    writeTileset(w, ts, firstGid);
    gm.insert(firstGid, ts);
    firstGid += Math.max(ts.nextTileId, ts.tileCount + 1);
  }
  w.writeEndTable();

  // Layers
  writeLayers(w, gm, map, map.layers);

  w.writeEndTable();
  w.writeEndDocument();

  return w.result();
}

/* ─────────────────────────── tileset / layers ─────────────────────────── */

function writeTileset(w: LuaTableWriter, ts: Tileset, firstGid: number): void {
  w.writeStartTable();
  w.writeKeyAndValue('name', ts.name);
  w.writeKeyAndValue('firstgid', firstGid);
  w.writeKeyAndValue('class', ts.className);
  w.writeKeyAndValue('tilewidth', ts.tileWidth);
  w.writeKeyAndValue('tileheight', ts.tileHeight);
  w.writeKeyAndValue('spacing', ts.tileSpacing);
  w.writeKeyAndValue('margin', ts.margin);
  w.writeKeyAndValue('columns', ts.columnCount);

  if (ts.imageReference.source) {
    w.writeKeyAndValue('image', ts.imageReference.source);
    w.writeKeyAndValue('imagewidth', ts.imageReference.size.width);
    w.writeKeyAndValue('imageheight', ts.imageReference.size.height);
  }

  if (ts.transparentColor) {
    w.writeKeyAndValue('transparentcolor', ts.transparentColor);
  }
  if (ts.backgroundColor) writeColor(w, 'backgroundcolor', ts.backgroundColor);

  w.writeStartTable('tileoffset');
  w.writeKeyAndValue('x', ts.tileOffset.x);
  w.writeKeyAndValue('y', ts.tileOffset.y);
  w.writeEndTable();

  w.writeStartTable('grid');
  w.writeKeyAndValue(
    'orientation',
    ts.orientation === TilesetOrientation.Isometric ? 'isometric' : 'orthogonal',
  );
  w.writeKeyAndValue('width', ts.gridSize.width);
  w.writeKeyAndValue('height', ts.gridSize.height);
  w.writeEndTable();

  writeProperties(w, ts.properties);

  w.writeStartTable('wangsets');
  // Wang sets are out of scope for this port — emit an empty table so the
  // upstream key ordering is preserved.
  w.writeEndTable();

  w.writeKeyAndValue('tilecount', ts.tileCount);
  w.writeStartTable('tiles');

  for (const tile of ts.tiles) {
    if (
      !tile.className &&
      tile.properties.size === 0 &&
      !tile.imageSource &&
      tile.frames.length === 0 &&
      tile.probability === 1
    ) {
      continue;
    }
    w.writeStartTable();
    w.writeKeyAndValue('id', tile.id);
    if (tile.className) w.writeKeyAndValue('type', tile.className);
    if (tile.properties.size > 0) writeProperties(w, tile.properties);
    if (tile.imageSource) {
      w.writeKeyAndValue('image', tile.imageSource);
      if (tile.imageRect.width || tile.imageRect.height) {
        w.writeKeyAndValue('width', tile.imageRect.width);
        w.writeKeyAndValue('height', tile.imageRect.height);
      }
    }
    if (tile.probability !== 1) w.writeKeyAndValue('probability', tile.probability);
    if (tile.frames.length > 0) {
      w.writeStartTable('animation');
      for (const f of tile.frames) {
        w.writeStartTable();
        w.writeKeyAndValue('tileid', f.tileId);
        w.writeKeyAndValue('duration', f.duration);
        w.writeEndTable();
      }
      w.writeEndTable();
    }
    w.writeEndTable();
  }
  w.writeEndTable();

  w.writeEndTable();
}

function writeLayers(
  w: LuaTableWriter,
  gm: GidMapper,
  map: TiledMap,
  layers: readonly Layer[],
): void {
  w.writeStartTable('layers');
  for (const l of layers) {
    if (l.isTileLayer()) writeTileLayer(w, gm, map, l as TileLayer);
    else if (l.isObjectGroup()) writeObjectGroup(w, gm, l as ObjectGroup);
    else if (l.isImageLayer()) writeImageLayer(w, l as ImageLayer);
    else if (l.isGroupLayer()) writeGroupLayer(w, gm, map, l as GroupLayer);
  }
  w.writeEndTable();
}

function writeTileLayer(
  w: LuaTableWriter,
  gm: GidMapper,
  map: TiledMap,
  tl: TileLayer,
): void {
  w.writeStartTable();
  w.writeKeyAndValue('type', 'tilelayer');
  w.writeKeyAndValue('x', tl.x);
  w.writeKeyAndValue('y', tl.y);
  w.writeKeyAndValue('width', tl.width);
  w.writeKeyAndValue('height', tl.height);
  writeLayerProperties(w, tl);
  writeProperties(w, tl.properties);

  // We always emit `encoding = "lua"` with a flat list of gids — same as the
  // upstream CSV/XML format path. Base64/zlib are intentionally not supported
  // here to keep the port minimal & dependency-free.
  w.writeKeyAndValue('encoding', 'lua');

  w.writeStartTable('data');
  for (let y = 0; y < tl.height; y++) {
    if (y > 0) w.prepareNewLine();
    for (let x = 0; x < tl.width; x++) {
      const gid = gm.cellToGid(tl.cellAt(x, y));
      w.writeValue(gid);
    }
  }
  w.writeEndTable();
  // `map` is currently unused for the encoding-only path; once base64
  // encoding is added the LayerDataFormat will need to be inspected here.
  void map;

  w.writeEndTable();
}

function writeObjectGroup(w: LuaTableWriter, gm: GidMapper, og: ObjectGroup): void {
  w.writeStartTable();
  w.writeKeyAndValue('type', 'objectgroup');
  w.writeKeyAndValue('draworder', drawOrderToString(og.drawOrder));
  writeLayerProperties(w, og);
  writeProperties(w, og.properties);

  w.writeStartTable('objects');
  for (const o of og.objects) writeMapObject(w, gm, o);
  w.writeEndTable();

  w.writeEndTable();
}

function writeImageLayer(w: LuaTableWriter, il: ImageLayer): void {
  w.writeStartTable();
  w.writeKeyAndValue('type', 'imagelayer');
  w.writeKeyAndValue('image', il.imageSource);
  if (il.transparentColor) w.writeKeyAndValue('transparentcolor', il.transparentColor);
  writeLayerProperties(w, il);
  w.writeKeyAndValue('repeatx', il.repeatX);
  w.writeKeyAndValue('repeaty', il.repeatY);
  writeProperties(w, il.properties);
  w.writeEndTable();
}

function writeGroupLayer(
  w: LuaTableWriter,
  gm: GidMapper,
  map: TiledMap,
  gl: GroupLayer,
): void {
  w.writeStartTable();
  w.writeKeyAndValue('type', 'group');
  writeLayerProperties(w, gl);
  writeProperties(w, gl.properties);
  writeLayers(w, gm, map, gl.layers);
  w.writeEndTable();
}

function writeMapObject(w: LuaTableWriter, gm: GidMapper, o: MapObject): void {
  w.writeStartTable();
  w.writeKeyAndValue('id', o.id);
  w.writeKeyAndValue('name', o.name);
  w.writeKeyAndValue('type', o.className);
  w.writeKeyAndValue('shape', shapeToString(o.shape));
  w.writeKeyAndValue('x', o.x);
  w.writeKeyAndValue('y', o.y);
  w.writeKeyAndValue('width', o.width);
  w.writeKeyAndValue('height', o.height);
  w.writeKeyAndValue('rotation', o.rotation);
  w.writeKeyAndValue('opacity', 1);

  if (!o.cell.isEmpty()) {
    w.writeKeyAndValue('gid', gm.cellToGid(o.cell));
  }
  w.writeKeyAndValue('visible', o.visible);

  if (o.shape === MapObjectShape.Polygon || o.shape === MapObjectShape.Polyline) {
    writePolygon(w, o);
  }
  writeProperties(w, o.properties);
  w.writeEndTable();
}

function writePolygon(w: LuaTableWriter, o: MapObject): void {
  w.writeStartTable(o.shape === MapObjectShape.Polygon ? 'polygon' : 'polyline');
  for (const p of o.polygon) {
    w.writeStartTable();
    w.setSuppressNewlines(true);
    w.writeKeyAndValue('x', p.x);
    w.writeKeyAndValue('y', p.y);
    w.writeEndTable();
    w.setSuppressNewlines(false);
  }
  w.writeEndTable();
}

function shapeToString(s: MapObjectShape): string {
  switch (s) {
    case MapObjectShape.Rectangle:
      return 'rectangle';
    case MapObjectShape.Polygon:
      return 'polygon';
    case MapObjectShape.Polyline:
      return 'polyline';
    case MapObjectShape.Ellipse:
      return 'ellipse';
    case MapObjectShape.Point:
      return 'point';
    case MapObjectShape.Text:
      return 'text';
    default:
      return 'rectangle';
  }
}

function writeLayerProperties(w: LuaTableWriter, layer: Layer): void {
  if (layer.id !== 0) w.writeKeyAndValue('id', layer.id);
  w.writeKeyAndValue('name', layer.name);
  w.writeKeyAndValue('class', layer.className);
  w.writeKeyAndValue('visible', layer.visible);
  w.writeKeyAndValue('opacity', layer.opacity);
  w.writeKeyAndValue('offsetx', layer.offset.x);
  w.writeKeyAndValue('offsety', layer.offset.y);
  w.writeKeyAndValue('parallaxx', layer.parallaxFactor.x);
  w.writeKeyAndValue('parallaxy', layer.parallaxFactor.y);
  if (layer.tintColor) writeColor(w, 'tintcolor', layer.tintColor);
}

function writeProperties(w: LuaTableWriter, props: Properties): void {
  w.writeStartTable('properties');
  for (const [name, value] of props) {
    w.writeQuotedKeyAndValue(name, primitiveForLua(value));
  }
  w.writeEndTable();
}

function primitiveForLua(v: PropertyValue): string | number | boolean {
  switch (v.kind) {
    case 'string':
      return v.value;
    case 'int':
      return v.value;
    case 'float':
      return v.value;
    case 'bool':
      return v.value;
    case 'color':
      return v.value;
    case 'file':
      return v.url;
    case 'object':
      return v.id;
    case 'class':
      return `[class ${v.typeName}]`;
    case 'enum':
      return v.value;
  }
}

function writeColor(w: LuaTableWriter, name: string, color: string): void {
  // Tiled writes `name = { r, g, b }` (or 4 values when alpha != 255). The
  // editor stores colors as either `#RRGGBB` or `#AARRGGBB`.
  const [r, g, b, a] = parseHexColor(color);
  w.writeStartTable(name);
  w.setSuppressNewlines(true);
  w.writeValue(r);
  w.writeValue(g);
  w.writeValue(b);
  if (a !== 255) w.writeValue(a);
  w.writeEndTable();
  w.setSuppressNewlines(false);
}

function parseHexColor(c: string): [number, number, number, number] {
  const m = c.replace('#', '');
  if (m.length === 6) return [hex2(m, 0), hex2(m, 2), hex2(m, 4), 255];
  if (m.length === 8) return [hex2(m, 2), hex2(m, 4), hex2(m, 6), hex2(m, 0)];
  return [0, 0, 0, 255];
}

function hex2(s: string, i: number): number {
  return parseInt(s.substring(i, i + 2), 16) || 0;
}

/* ─────────────────────────── reader ─────────────────────────── */

/**
 * Parse a Lua-encoded map back into a `TiledMap`. Supports the subset emitted
 * by `writeMapLua`: orthogonal/isometric maps with embedded tilesets, tile
 * layers using `encoding = "lua"`, object groups (rectangle / point /
 * ellipse / polygon / polyline), image layers and nested group layers.
 *
 * Property values are decoded heuristically (Lua erases the int/float
 * distinction so we follow JS conventions — integer-valued numbers parse as
 * `int`, others as `float`).
 */
export function readMapLua(text: string): TiledMap {
  const v = parseLuaReturn(text);
  const root = asTable(v);
  if (!root) throw new Error('Lua map: expected top-level return table');

  const map = new TiledMap({
    orientation: orientationFromString(stringAt(root, 'orientation') ?? 'orthogonal'),
    renderOrder: renderOrderFromString(stringAt(root, 'renderorder') ?? 'right-down'),
    width: numberAt(root, 'width') ?? 0,
    height: numberAt(root, 'height') ?? 0,
    tileWidth: numberAt(root, 'tilewidth') ?? 0,
    tileHeight: numberAt(root, 'tileheight') ?? 0,
    hexSideLength: numberAt(root, 'hexsidelength') ?? 0,
    skewX: numberAt(root, 'skewx') ?? 0,
    skewY: numberAt(root, 'skewy') ?? 0,
    staggerAxis: stringAt(root, 'staggeraxis') ? staggerAxisFromString(stringAt(root, 'staggeraxis')!) : undefined,
    staggerIndex: stringAt(root, 'staggerindex') ? staggerIndexFromString(stringAt(root, 'staggerindex')!) : undefined,
  });

  const cls = stringAt(root, 'class');
  if (cls) map.setClassName(cls);
  const nextLayerId = numberAt(root, 'nextlayerid');
  if (typeof nextLayerId === 'number') map.setNextLayerId(nextLayerId);
  const nextObjectId = numberAt(root, 'nextobjectid');
  if (typeof nextObjectId === 'number') map.setNextObjectId(nextObjectId);

  const props = asTable(root.map.get('properties'));
  if (props) applyProperties(map, props);

  const gm = new GidMapper();
  const tilesets = asTable(root.map.get('tilesets'));
  if (tilesets) {
    for (const tsVal of tilesets.array) {
      const tsTab = asTable(tsVal);
      if (!tsTab) continue;
      const firstGid = numberAt(tsTab, 'firstgid') ?? 1;
      const ts = readTilesetLua(tsTab);
      map.addTileset(ts);
      gm.insert(firstGid, ts);
    }
  }

  const layers = asTable(root.map.get('layers'));
  if (layers) {
    for (const lv of layers.array) {
      const lt = asTable(lv);
      if (!lt) continue;
      const layer = readLayerLua(lt, gm);
      if (layer) map.addLayer(layer);
    }
  }

  return map;
}

function readTilesetLua(t: LuaTable): Tileset {
  const ts = new Tileset(
    stringAt(t, 'name') ?? '',
    numberAt(t, 'tilewidth') ?? 0,
    numberAt(t, 'tileheight') ?? 0,
    numberAt(t, 'spacing') ?? 0,
    numberAt(t, 'margin') ?? 0,
  );
  const cls = stringAt(t, 'class');
  if (cls) ts.setClassName(cls);
  const columns = numberAt(t, 'columns');
  if (typeof columns === 'number') ts.setColumnCount(columns);
  const image = stringAt(t, 'image');
  if (image) {
    ts.imageReference.source = image;
    ts.imageReference.size = {
      width: numberAt(t, 'imagewidth') ?? 0,
      height: numberAt(t, 'imageheight') ?? 0,
    };
  }
  const transparent = stringAt(t, 'transparentcolor');
  if (transparent) ts.setTransparentColor(transparent);
  const tilesT = asTable(t.map.get('tiles'));
  if (tilesT) {
    for (const tv of tilesT.array) {
      const tt = asTable(tv);
      if (!tt) continue;
      const id = numberAt(tt, 'id');
      if (typeof id !== 'number') continue;
      const tile = ts.findOrCreateTile(id);
      const type = stringAt(tt, 'type');
      if (type) tile.setType(type);
      const probability = numberAt(tt, 'probability');
      if (typeof probability === 'number') tile.probability = probability;
      const props = asTable(tt.map.get('properties'));
      if (props) applyProperties(tile, props);
    }
  }
  const props = asTable(t.map.get('properties'));
  if (props) applyProperties(ts, props);
  return ts;
}

function readLayerLua(t: LuaTable, gm: GidMapper): Layer | undefined {
  const type = stringAt(t, 'type') ?? 'tilelayer';
  if (type === 'tilelayer') {
    const tl = new TileLayer(
      stringAt(t, 'name') ?? '',
      numberAt(t, 'x') ?? 0,
      numberAt(t, 'y') ?? 0,
      numberAt(t, 'width') ?? 0,
      numberAt(t, 'height') ?? 0,
    );
    applyLayerCommon(tl, t);
    const data = asTable(t.map.get('data'));
    if (data && data.array.length) {
      const w = tl.width;
      const h = tl.height;
      for (let i = 0; i < data.array.length && i < w * h; i++) {
        const gid = Number(data.array[i] ?? 0) >>> 0;
        if (gid === 0) continue;
        const x = i % w;
        const y = Math.floor(i / w);
        const { cell } = gm.gidToCell(gid);
        if (!cell.isEmpty()) tl.setCell(x, y, cell);
      }
    }
    return tl;
  }
  if (type === 'objectgroup') {
    const og = new ObjectGroup(
      stringAt(t, 'name') ?? '',
      numberAt(t, 'x') ?? 0,
      numberAt(t, 'y') ?? 0,
    );
    applyLayerCommon(og, t);
    const draworder = stringAt(t, 'draworder');
    if (draworder) og.drawOrder = drawOrderFromString(draworder);
    const objs = asTable(t.map.get('objects'));
    if (objs) {
      for (const ov of objs.array) {
        const ot = asTable(ov);
        if (!ot) continue;
        og.addObject(readObjectLua(ot, gm));
      }
    }
    return og;
  }
  if (type === 'imagelayer') {
    const il = new ImageLayer(
      stringAt(t, 'name') ?? '',
      numberAt(t, 'x') ?? 0,
      numberAt(t, 'y') ?? 0,
    );
    applyLayerCommon(il, t);
    il.imageSource = stringAt(t, 'image') ?? '';
    const transparent = stringAt(t, 'transparentcolor');
    if (transparent) il.transparentColor = transparent;
    return il;
  }
  if (type === 'group') {
    const gl = new GroupLayer(
      stringAt(t, 'name') ?? '',
      numberAt(t, 'x') ?? 0,
      numberAt(t, 'y') ?? 0,
    );
    applyLayerCommon(gl, t);
    const sub = asTable(t.map.get('layers'));
    if (sub) {
      for (const lv of sub.array) {
        const lt = asTable(lv);
        if (!lt) continue;
        const child = readLayerLua(lt, gm);
        if (child) gl.addLayer(child);
      }
    }
    return gl;
  }
  return undefined;
}

function readObjectLua(t: LuaTable, gm: GidMapper): MapObject {
  const o = new MapObject(
    stringAt(t, 'name') ?? '',
    stringAt(t, 'type') ?? '',
    { x: numberAt(t, 'x') ?? 0, y: numberAt(t, 'y') ?? 0 },
    { width: numberAt(t, 'width') ?? 0, height: numberAt(t, 'height') ?? 0 },
  );
  const id = numberAt(t, 'id');
  if (typeof id === 'number') o.setId(id);
  const rot = numberAt(t, 'rotation');
  if (typeof rot === 'number') o.rotation = rot;
  const vis = boolAt(t, 'visible');
  if (typeof vis === 'boolean') o.visible = vis;
  const shape = stringAt(t, 'shape');
  if (shape === 'point') o.setShape(MapObjectShape.Point);
  else if (shape === 'ellipse') o.setShape(MapObjectShape.Ellipse);
  else if (shape === 'polygon') o.setShape(MapObjectShape.Polygon);
  else if (shape === 'polyline') o.setShape(MapObjectShape.Polyline);
  else if (shape === 'text') o.setShape(MapObjectShape.Text);
  const gid = numberAt(t, 'gid');
  if (typeof gid === 'number') {
    const { cell } = gm.gidToCell(gid >>> 0);
    o.setCell(cell);
  }
  const poly = asTable(t.map.get(o.shape === MapObjectShape.Polyline ? 'polyline' : 'polygon'));
  if (poly) {
    const points: { x: number; y: number }[] = [];
    for (const pv of poly.array) {
      const pt = asTable(pv);
      if (!pt) continue;
      points.push({ x: numberAt(pt, 'x') ?? 0, y: numberAt(pt, 'y') ?? 0 });
    }
    o.setPolygon(points);
  }
  const props = asTable(t.map.get('properties'));
  if (props) applyProperties(o, props);
  return o;
}

function applyLayerCommon(layer: Layer, t: LuaTable): void {
  const id = numberAt(t, 'id');
  if (typeof id === 'number') layer.id = id;
  const opacity = numberAt(t, 'opacity');
  if (typeof opacity === 'number') layer.opacity = opacity;
  const visible = boolAt(t, 'visible');
  if (typeof visible === 'boolean') layer.visible = visible;
  const cls = stringAt(t, 'class');
  if (cls) layer.setClassName(cls);
  const ox = numberAt(t, 'offsetx');
  const oy = numberAt(t, 'offsety');
  if (typeof ox === 'number' || typeof oy === 'number') {
    layer.offset = { x: ox ?? 0, y: oy ?? 0 };
  }
  const px = numberAt(t, 'parallaxx');
  const py = numberAt(t, 'parallaxy');
  if (typeof px === 'number' || typeof py === 'number') {
    layer.parallaxFactor = { x: px ?? 1, y: py ?? 1 };
  }
  const props = asTable(t.map.get('properties'));
  if (props) applyProperties(layer, props);
}

function applyProperties(
  target: { setProperty(name: string, value: PropertyValue): void },
  t: LuaTable,
): void {
  for (const [k, v] of t.map) {
    const value = primitiveFromLua(v);
    if (value) target.setProperty(k, value);
  }
}

function primitiveFromLua(v: LuaValue): PropertyValue | undefined {
  if (typeof v === 'string') return Property.string(v);
  if (typeof v === 'boolean') return Property.bool(v);
  if (typeof v === 'number') {
    return Number.isInteger(v) ? Property.int(v) : Property.float(v);
  }
  return undefined;
}

function numberAt(t: LuaTable, key: string): number | undefined {
  const v = t.map.get(key);
  return typeof v === 'number' ? v : undefined;
}

function stringAt(t: LuaTable, key: string): string | undefined {
  const v = t.map.get(key);
  return typeof v === 'string' ? v : undefined;
}

function boolAt(t: LuaTable, key: string): boolean | undefined {
  const v = t.map.get(key);
  return typeof v === 'boolean' ? v : undefined;
}

/* ─────────────────────────── plugin descriptor ────────────────────────────── */

export const luaPlugin: FileFormat = {
  id: 'lua',
  name: 'Lua files',
  extension: 'lua',
  capabilities: FormatCapability.Write | FormatCapability.Read,
  write(map) {
    return { [`${suggestedName(map)}.lua`]: writeMapLua(map) };
  },
  read(input) {
    const first = Object.values(input)[0];
    if (!first) throw new Error('Lua plugin: no input file provided');
    return readMapLua(first);
  },
};

function suggestedName(map: TiledMap): string {
  if (map.fileName) {
    const base = map.fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    return base || 'map';
  }
  return 'map';
}

