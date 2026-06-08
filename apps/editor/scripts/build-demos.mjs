// One-shot converter: walks reference/examples/*.tmx, converts each into a
// TMJ file under apps/editor/public/demos/, copies referenced tileset images
// alongside, and emits `demos/index.json` listing every demo.
//
// Scope: orthogonal / isometric / staggered / hexagonal tile-layer maps with
// CSV or base64+zlib/gzip encodings. Object groups, image layers, group
// layers, and embedded or external (.tsx) tilesets all supported. Wang sets
// are preserved; per-tile properties / animations / probabilities preserved.

import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import pako from 'pako';

import {
  Cell,
  ImageLayer,
  GroupLayer,
  LoadingStatus,
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  ObjectGroupDrawOrder,
  Property,
  StaggerAxis,
  StaggerIndex,
  TileLayer,
  Tileset,
  WangColor,
  WangId,
  WangSet,
  WangSetType,
  orientationFromString,
  renderOrderFromString,
} from '@tiled-ts/core';
import { writeMapJson } from '@tiled-ts/format';

const __filename = fileURLToPath(import.meta.url);
const editorRoot = resolve(dirname(__filename), '..');
const repoRoot = resolve(editorRoot, '..', '..');
const examplesRoot = join(repoRoot, 'reference', 'examples');
const outRoot = join(editorRoot, 'public', 'demos');

/**
 * Demo sources. The Problocks `fantasy-tileset/` library is the primary set;
 * Tiled's bundled examples come along for the ride.
 */
const PROBLOCKS_ROOT = '/Users/ihsanduru/Problocks/public/fantasy-tileset';
const SOURCES = [
  { root: examplesRoot, category: 'Tiled Examples', idPrefix: 'tiled' },
  { root: join(PROBLOCKS_ROOT, 'premium', 'tiled'), category: 'Forest Village (Premium)', idPrefix: 'premium' },
  { root: join(PROBLOCKS_ROOT, 'castle', 'tiled'), category: 'Castles and Fortresses', idPrefix: 'castle' },
  { root: join(PROBLOCKS_ROOT, 'desert', 'tiled'), category: 'Desert Oasis', idPrefix: 'desert' },
  { root: join(PROBLOCKS_ROOT, 'snow', 'tiled'), category: 'Snow Adventures', idPrefix: 'snow' },
  { root: join(PROBLOCKS_ROOT, 'seasons', 'tiled'), category: 'Turning of the Seasons', idPrefix: 'seasons' },
  { root: join(PROBLOCKS_ROOT, 'interior', 'tiled'), category: 'Medieval Interiors', idPrefix: 'interior' },
];

/** Per-source image-fallback directories (used when a tmx/tsx references a
 *  non-existent path — common for Problocks where `.tsx` paths point at
 *  `../../Art/...` which is the source asset folder, not the deployed copy). */
function imgFallbackDirFor(srcRoot) {
  // Problocks sets keep PNGs in a sibling `img/` directory.
  const probDir = resolve(srcRoot, '..', 'img');
  if (existsSync(probDir)) return probDir;
  return undefined;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: true,
  preserveOrder: false,
  isArray: (name) =>
    ['layer', 'tileset', 'objectgroup', 'imagelayer', 'group', 'object',
     'property', 'tile', 'frame', 'wangset', 'wangcolor', 'wangtile',
     'point', 'polygon', 'polyline', 'chunk'].includes(name),
});

await mkdir(outRoot, { recursive: true });

const index = [];

for (const source of SOURCES) {
  if (!existsSync(source.root)) {
    console.log(`(skipping missing source: ${source.root})`);
    continue;
  }
  const candidates = await findTmxFiles(source.root);
  const fallbackDir = imgFallbackDirFor(source.root);

  for (const tmxPath of candidates) {
    try {
      const baseName = relative(source.root, tmxPath).replace(/[\/\\]/g, '_').replace(/\.tmx$/, '');
      const flatId = `${source.idPrefix}__${baseName}`;
      const tmjPath = join(outRoot, `${flatId}.tmj`);
      const map = await convertTmx(tmxPath, { fallbackImageDir: fallbackDir, imagePrefix: flatId });
      await writeFile(tmjPath, JSON.stringify(writeMapJson(map), null, 2));
      index.push({
        id: flatId,
        title: niceTitle(baseName),
        category: source.category,
        src: `./demos/${flatId}.tmj`,
      });
      console.log(`✓ ${source.category} — ${baseName}`);
    } catch (err) {
      console.warn(`✗ ${relative(repoRoot, tmxPath)}: ${err.message}`);
    }
  }
}

await writeFile(join(outRoot, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\nWrote ${index.length} demo(s) + index.json to ${relative(repoRoot, outRoot)}.`);

/* ───────────────────────── helpers ────────────────────────── */

async function findTmxFiles(root) {
  const out = [];
  for (const entry of await readdir(root)) {
    const full = join(root, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await findTmxFiles(full)));
    else if (entry.endsWith('.tmx')) out.push(full);
  }
  return out;
}

function niceTitle(id) {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function convertTmx(tmxPath, opts = {}) {
  const fallbackImageDir = opts.fallbackImageDir;
  const imagePrefix = opts.imagePrefix ?? '';
  const text = await readFile(tmxPath, 'utf8');
  const tree = xml.parse(text);
  if (!tree.map) throw new Error('not a <map> document');
  const m = tree.map;

  const map = new TiledMap({
    width: int(m['@width']),
    height: int(m['@height']),
    tileWidth: int(m['@tilewidth']),
    tileHeight: int(m['@tileheight']),
    orientation: orientationFromString(str(m['@orientation'], 'orthogonal')),
    renderOrder: renderOrderFromString(str(m['@renderorder'], 'right-down')),
    infinite: bool(m['@infinite']),
    hexSideLength: int(m['@hexsidelength']),
    staggerAxis: m['@staggeraxis'] === 'x' ? StaggerAxis.StaggerX : StaggerAxis.StaggerY,
    staggerIndex: m['@staggerindex'] === 'even' ? StaggerIndex.StaggerEven : StaggerIndex.StaggerOdd,
    backgroundColor: m['@backgroundcolor'],
  });
  if (m['@class']) map.setClassName(m['@class']);
  if (m['@nextlayerid']) map.setNextLayerId(int(m['@nextlayerid']));
  if (m['@nextobjectid']) map.setNextObjectId(int(m['@nextobjectid']));

  if (m.properties?.property) {
    for (const [k, v] of parseProperties(m.properties.property)) map.setProperty(k, v);
  }

  // tilesets — track each parsed tileset's resolution base dir so the image
  // copy step can resolve `<image source="..."/>` correctly. External .tsx
  // tilesets resolve images relative to the .tsx, not the .tmx.
  const gidRanges = [];
  for (const ts of m.tileset ?? []) {
    const firstGid = int(ts['@firstgid']);
    let parsed;
    let baseDir;
    if (ts['@source']) {
      const tsxPath = await resolveTsxPath(ts['@source'], dirname(tmxPath));
      if (!tsxPath) throw new Error(`tsx not found: ${ts['@source']}`);
      baseDir = dirname(tsxPath);
      const tsxText = await readFile(tsxPath, 'utf8');
      const tsxTree = xml.parse(tsxText);
      const root = Array.isArray(tsxTree.tileset) ? tsxTree.tileset[0] : tsxTree.tileset;
      parsed = parseTileset(root, tsxPath);
    } else {
      baseDir = dirname(tmxPath);
      parsed = parseTileset(ts, tmxPath);
    }
    map.addTileset(parsed);
    gidRanges.push({ firstGid, tileset: parsed });

    if (parsed.imageReference.source) {
      const imgFsPath = await resolveImagePath(parsed.imageReference.source, baseDir, fallbackImageDir);
      if (imgFsPath) {
        const flatName = `${imagePrefix}_${parsed.name}_${parsed.imageReference.source.replace(/[\/\\]/g, '_')}`;
        await copyFile(imgFsPath, join(outRoot, flatName));
        parsed.imageReference.source = `./demos/${flatName}`;
      }
    }
    for (const tile of parsed.tiles) {
      if (!tile.imageSource) continue;
      const imgFsPath = await resolveImagePath(tile.imageSource, baseDir, fallbackImageDir);
      if (imgFsPath) {
        const flatName = `${imagePrefix}_${parsed.name}_tile${tile.id}_${tile.imageSource.replace(/[\/\\]/g, '_')}`;
        await copyFile(imgFsPath, join(outRoot, flatName));
        tile.imageSource = `./demos/${flatName}`;
      }
    }
  }

  // layers in document order
  const orderedTopLevel = walkLayers(m);
  for (const layer of orderedTopLevel) {
    map.addLayer(layer);
  }

  // resolve all tile gids → cells, now that the gid table is complete.
  resolveAllCells(map, gidRanges);

  return map;
}

function parseTileset(t, tsxPath) {
  const ts = new Tileset(
    str(t['@name'], 'Tileset'),
    int(t['@tilewidth']),
    int(t['@tileheight']),
    int(t['@spacing']),
    int(t['@margin']),
  );
  if (t['@class']) ts.setClassName(t['@class']);
  if (t['@columns']) ts.setColumnCount(int(t['@columns']));
  if (t['@objectalignment']) ts.objectAlignment = ts.objectAlignment; // keep default; rare
  if (t['@backgroundcolor']) ts.backgroundColor = t['@backgroundcolor'];

  if (t.image) {
    const img = Array.isArray(t.image) ? t.image[0] : t.image;
    ts.imageReference.source = img['@source'];
    ts.imageReference.size = { width: int(img['@width']), height: int(img['@height']) };
    ts.imageReference.status = LoadingStatus.LoadingPending;
    if (img['@trans']) ts.setTransparentColor(`#${img['@trans']}`);
  }
  if (t.tileoffset) {
    ts.tileOffset = { x: int(t.tileoffset['@x']), y: int(t.tileoffset['@y']) };
  }
  if (t.grid) {
    ts.gridSize = { width: int(t.grid['@width']), height: int(t.grid['@height']) };
  }

  // <tile> per-tile metadata
  for (const tile of t.tile ?? []) {
    const tid = int(tile['@id']);
    const tt = ts.findOrCreateTile(tid);
    if (tile['@type']) tt.setType(tile['@type']);
    if (tile['@probability']) tt.probability = parseFloat(tile['@probability']);
    if (tile.image) {
      const img = Array.isArray(tile.image) ? tile.image[0] : tile.image;
      tt.imageSource = img['@source'];
      tt.imageRect = { x: 0, y: 0, width: int(img['@width']), height: int(img['@height']) };
    }
    if (tile.animation?.frame) {
      tt.setFrames(
        tile.animation.frame.map((f) => ({
          tileId: int(f['@tileid']),
          duration: int(f['@duration']),
        })),
      );
    }
    if (tile.properties?.property) {
      for (const [k, v] of parseProperties(tile.properties.property)) tt.setProperty(k, v);
    }
    if (tile.objectgroup) {
      const og = parseObjectGroup(Array.isArray(tile.objectgroup) ? tile.objectgroup[0] : tile.objectgroup);
      tt.objectGroup = og;
    }
  }

  // wang sets
  if (t.wangsets?.wangset) {
    for (const ws of t.wangsets.wangset) {
      const set = new WangSet(
        ts,
        str(ws['@name'], 'Wang'),
        ws['@type'] === 'edge'
          ? WangSetType.Edge
          : ws['@type'] === 'corner'
            ? WangSetType.Corner
            : WangSetType.Mixed,
        int(ws['@tile'], -1),
      );
      for (const wc of ws.wangcolor ?? []) {
        set.addWangColor(
          new WangColor(
            set.colorCount() + 1,
            str(wc['@name']),
            str(wc['@color'], '#ff0000'),
            int(wc['@tile'], -1),
            parseFloat(str(wc['@probability'], '1')),
          ),
        );
      }
      for (const wt of ws.wangtile ?? []) {
        const id = new WangId();
        const parts = str(wt['@wangid'], '0,0,0,0,0,0,0,0').split(',').map((n) => parseInt(n.trim(), 10));
        for (let i = 0; i < Math.min(8, parts.length); i++) id.setIndexColor(i, parts[i] ?? 0);
        set.setWangId(int(wt['@tileid']), id);
      }
      ts.addWangSet(set);
    }
  }

  if (t.properties?.property) {
    for (const [k, v] of parseProperties(t.properties.property)) ts.setProperty(k, v);
  }

  // Stash the source path so we can copy the image later (and resolve relative source).
  if (!ts.imageReference.source && tsxPath) {
    // image-collection tilesets — nothing to copy on the tileset level
  }
  return ts;
}

function walkLayers(parent) {
  // Tile layers, object groups, image layers, and groups appear interleaved
  // in document order in TMX. fast-xml-parser hoists them per name, so we
  // approximate sibling order by interleaving the categories — accurate
  // enough for visualisation; explicit `id` attributes preserve identity.
  const out = [];
  for (const tl of parent.layer ?? []) out.push(parseTileLayer(tl));
  for (const og of parent.objectgroup ?? []) out.push(parseObjectGroup(og));
  for (const il of parent.imagelayer ?? []) out.push(parseImageLayer(il));
  for (const gl of parent.group ?? []) {
    const g = new GroupLayer(str(gl['@name'], 'Group'), int(gl['@x']), int(gl['@y']));
    applyLayerCommon(g, gl);
    for (const child of walkLayers(gl)) g.addLayer(child);
    out.push(g);
  }
  return out;
}

function parseTileLayer(tl) {
  const layer = new TileLayer(
    str(tl['@name']),
    int(tl['@x']),
    int(tl['@y']),
    int(tl['@width']),
    int(tl['@height']),
  );
  applyLayerCommon(layer, tl);
  // Store the raw payload(s) on the layer so resolveAllCells can map gids.
  if (tl.data) {
    const data = tl.data;
    layer.__raw = decodeData(data);
  }
  return layer;
}

function decodeData(data) {
  // chunked (infinite map) — return list of { x, y, w, h, gids }
  if (data.chunk) {
    return data.chunk.map((c) => ({
      x: int(c['@x']),
      y: int(c['@y']),
      w: int(c['@width']),
      h: int(c['@height']),
      gids: decodePayload(data['@encoding'], data['@compression'], c['#text'] ?? c.payload ?? ''),
    }));
  }
  // single payload
  return decodePayload(data['@encoding'], data['@compression'], data['#text'] ?? '');
}

function decodePayload(encoding, compression, text) {
  if (encoding === 'csv') {
    return new Uint32Array(text.split(',').map((s) => parseInt(s.trim(), 10) >>> 0));
  }
  if (encoding === 'base64') {
    const bytes = base64Decode(text);
    let decoded = bytes;
    if (compression === 'zlib') decoded = pako.inflate(bytes);
    else if (compression === 'gzip') decoded = pako.ungzip(bytes);
    const out = new Uint32Array(decoded.length / 4);
    for (let i = 0; i < out.length; i++) {
      const o = i * 4;
      out[i] = (decoded[o] | (decoded[o + 1] << 8) | (decoded[o + 2] << 16) | (decoded[o + 3] << 24)) >>> 0;
    }
    return out;
  }
  throw new Error(`unsupported layer encoding: ${encoding}`);
}

function base64Decode(s) {
  const cleaned = s.replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(cleaned, 'base64'));
}

function resolveAllCells(map, gidRanges) {
  // Walk every layer (including nested) and translate __raw → setCell calls.
  const ranges = gidRanges.slice().sort((a, b) => b.firstGid - a.firstGid);
  const gidToCell = (gid) => {
    const FLIPPED_H = 0x80000000;
    const FLIPPED_V = 0x40000000;
    const FLIPPED_AD = 0x20000000;
    const FLIPPED_HEX120 = 0x10000000;
    const ALL = FLIPPED_H | FLIPPED_V | FLIPPED_AD | FLIPPED_HEX120;
    const flags = gid & ALL;
    const id = gid & ~ALL;
    if (id === 0) return new Cell();
    for (const r of ranges) {
      if (id >= r.firstGid) {
        const c = new Cell(r.tileset, id - r.firstGid);
        if (flags & FLIPPED_H) c.setFlippedHorizontally(true);
        if (flags & FLIPPED_V) c.setFlippedVertically(true);
        if (flags & FLIPPED_AD) c.setFlippedAntiDiagonally(true);
        if (flags & FLIPPED_HEX120) c.setRotatedHexagonal120(true);
        return c;
      }
    }
    return new Cell();
  };

  const visit = (layer) => {
    if (layer.isTileLayer()) {
      const raw = layer.__raw;
      if (Array.isArray(raw)) {
        // chunked infinite
        for (const chunk of raw) {
          for (let y = 0; y < chunk.h; y++) {
            for (let x = 0; x < chunk.w; x++) {
              const gid = chunk.gids[y * chunk.w + x] ?? 0;
              if (gid === 0) continue;
              layer.setCell(chunk.x + x, chunk.y + y, gidToCell(gid));
            }
          }
        }
      } else if (raw) {
        const w = layer.width;
        const h = layer.height;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const gid = raw[y * w + x] ?? 0;
            if (gid === 0) continue;
            layer.setCell(x, y, gidToCell(gid));
          }
        }
      }
      delete layer.__raw;
    } else if (layer.isObjectGroup()) {
      // attach cells to tile-objects via their gid stash
      for (const obj of layer.objects) {
        if (obj.__gid != null) {
          obj.setCell(gidToCell(obj.__gid));
          delete obj.__gid;
        }
      }
    } else if (layer.isGroupLayer()) {
      for (const sub of layer.layers) visit(sub);
    }
  };
  for (const l of map.layers) visit(l);
}

function applyLayerCommon(layer, el) {
  if (el['@id']) layer.id = int(el['@id']);
  if (el['@visible'] !== undefined) layer.visible = el['@visible'] !== '0';
  if (el['@locked'] !== undefined) layer.locked = el['@locked'] === '1';
  if (el['@opacity'] !== undefined) layer.opacity = parseFloat(el['@opacity']);
  if (el['@offsetx'] !== undefined || el['@offsety'] !== undefined) {
    layer.offset = { x: parseFloat(str(el['@offsetx'], '0')), y: parseFloat(str(el['@offsety'], '0')) };
  }
  if (el['@parallaxx'] !== undefined || el['@parallaxy'] !== undefined) {
    layer.parallaxFactor = {
      x: parseFloat(str(el['@parallaxx'], '1')),
      y: parseFloat(str(el['@parallaxy'], '1')),
    };
  }
  if (el['@class']) layer.setClassName(el['@class']);
  if (el['@tintcolor']) layer.tintColor = el['@tintcolor'];
  if (el.properties?.property) {
    for (const [k, v] of parseProperties(el.properties.property)) layer.setProperty(k, v);
  }
}

function parseObjectGroup(og) {
  const group = new ObjectGroup(str(og['@name'], ''), int(og['@x']), int(og['@y']));
  applyLayerCommon(group, og);
  if (og['@color']) group.color = og['@color'];
  if (og['@draworder'] === 'index') group.drawOrder = ObjectGroupDrawOrder.IndexOrder;
  for (const o of og.object ?? []) {
    const obj = new MapObject(
      str(o['@name']),
      str(o['@type']),
      { x: parseFloat(str(o['@x'], '0')), y: parseFloat(str(o['@y'], '0')) },
      { width: parseFloat(str(o['@width'], '0')), height: parseFloat(str(o['@height'], '0')) },
    );
    if (o['@id']) obj.setId(int(o['@id']));
    if (o['@rotation']) obj.rotation = parseFloat(o['@rotation']);
    if (o['@visible'] === '0') obj.visible = false;

    if (o.point) obj.setShape(MapObjectShape.Point);
    else if (o.ellipse) obj.setShape(MapObjectShape.Ellipse);
    else if (o.polygon) {
      obj.setShape(MapObjectShape.Polygon);
      const pts = (Array.isArray(o.polygon) ? o.polygon[0] : o.polygon)['@points'];
      obj.setPolygon(parsePoints(pts));
    } else if (o.polyline) {
      obj.setShape(MapObjectShape.Polyline);
      const pts = (Array.isArray(o.polyline) ? o.polyline[0] : o.polyline)['@points'];
      obj.setPolygon(parsePoints(pts));
    } else if (o.text) {
      obj.setShape(MapObjectShape.Text);
    } else {
      obj.setShape(MapObjectShape.Rectangle);
    }
    if (o['@gid']) obj.__gid = int(o['@gid']);
    if (o.properties?.property) {
      for (const [k, v] of parseProperties(o.properties.property)) obj.setProperty(k, v);
    }
    group.addObject(obj);
  }
  return group;
}

function parseImageLayer(il) {
  const layer = new ImageLayer(str(il['@name']), int(il['@x']), int(il['@y']));
  applyLayerCommon(layer, il);
  if (il.image) {
    const img = Array.isArray(il.image) ? il.image[0] : il.image;
    layer.imageSource = img['@source'];
    if (img['@trans']) layer.transparentColor = `#${img['@trans']}`;
  }
  if (il['@repeatx']) layer.setRepeatX(true);
  if (il['@repeaty']) layer.setRepeatY(true);
  return layer;
}

function parsePoints(text) {
  return text.split(/\s+/).filter(Boolean).map((p) => {
    const [x, y] = p.split(',').map(parseFloat);
    return { x, y };
  });
}

function parseProperties(arr) {
  const out = [];
  for (const p of arr) {
    const name = p['@name'];
    const type = p['@type'] ?? 'string';
    const raw = p['@value'] ?? p['#text'] ?? '';
    let value;
    switch (type) {
      case 'int':
        value = Property.int(parseInt(raw, 10));
        break;
      case 'float':
        value = Property.float(parseFloat(raw));
        break;
      case 'bool':
        value = Property.bool(raw === 'true' || raw === '1');
        break;
      case 'color':
        value = Property.color(raw);
        break;
      case 'file':
        value = Property.file(raw);
        break;
      case 'object':
        value = Property.object(parseInt(raw, 10));
        break;
      default:
        value = Property.string(String(raw));
    }
    out.push([name, value]);
  }
  return out;
}

/** Resolve an image source: try the literal path first; on miss, search for
 *  the basename inside `fallbackDir`. */
async function resolveImagePath(srcPath, baseDir, fallbackDir) {
  const literal = resolve(baseDir, srcPath);
  if (existsSync(literal)) return literal;
  if (fallbackDir) {
    const bn = srcPath.split('/').pop().split('\\').pop();
    const alt = join(fallbackDir, bn);
    if (existsSync(alt)) return alt;
  }
  return undefined;
}

/** Resolve a `.tsx` reference: literal path → tmx's own dir → parent dir →
 *  any sibling Problocks `tiled/` folder under PROBLOCKS_ROOT. Problocks
 *  maps occasionally reference paths that cross set boundaries. */
async function resolveTsxPath(srcPath, tmxDir) {
  const literal = resolve(tmxDir, srcPath);
  if (existsSync(literal)) return literal;
  const bn = srcPath.split('/').pop().split('\\').pop();
  const inSameDir = join(tmxDir, bn);
  if (existsSync(inSameDir)) return inSameDir;
  const inParent = join(tmxDir, '..', bn);
  if (existsSync(inParent)) return inParent;
  if (existsSync(PROBLOCKS_ROOT)) {
    for (const subset of ['premium', 'castle', 'desert', 'snow', 'seasons', 'interior']) {
      const candidate = join(PROBLOCKS_ROOT, subset, 'tiled', bn);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function int(v, def = 0) {
  if (v === undefined || v === null || v === '') return def;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}
function bool(v) {
  return v === '1' || v === 'true';
}
function str(v, def = '') {
  return v === undefined || v === null ? def : String(v);
}
