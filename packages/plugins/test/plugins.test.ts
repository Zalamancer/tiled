import { describe, expect, it } from 'vitest';

import {
  Cell,
  CellFlag,
  Map as TiledMap,
  ObjectGroup,
  Property,
  TileLayer,
  Tileset,
} from '@tiled-ts/core';

import {
  createBuiltinRegistry,
  csvPlugin,
  defoldPlugin,
  gmxPlugin,
  json1Plugin,
  luaPlugin,
  readLayerCsv,
  readMapLua,
  txtPlugin,
  writeCsv,
  writeDefold,
  writeGmx,
  writeLayerCsv,
  writeMapJson1,
  writeMapLua,
  writeTxt,
  writeYy,
  yyPlugin,
} from '../src/index.js';

function makeBasicMap(): {
  map: TiledMap;
  ts: Tileset;
  tl: TileLayer;
} {
  const map = new TiledMap({ width: 3, height: 2, tileWidth: 16, tileHeight: 16 });
  map.setProperty('description', Property.string('hello'));

  const ts = new Tileset('terrain', 16, 16, 0, 0);
  ts.setColumnCount(4);
  ts.imageReference.source = 'terrain.png';
  ts.imageReference.size = { width: 64, height: 64 };
  for (let i = 0; i < 8; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);

  const tl = new TileLayer('main', 0, 0, 3, 2);
  tl.id = map.takeNextLayerId();
  tl.setCell(0, 0, new Cell(ts, 0));
  tl.setCell(1, 0, new Cell(ts, 1));
  tl.setCell(2, 1, new Cell(ts, 3));
  map.addLayer(tl);

  return { map, ts, tl };
}

describe('CSV plugin', () => {
  it('encodes each tile layer as comma-separated rows', () => {
    const { map } = makeBasicMap();
    const files = writeCsv(map, 'sample');
    expect(Object.keys(files)).toEqual(['sample.csv']);
    const lines = (files['sample.csv'] ?? '').trim().split('\n');
    expect(lines).toEqual(['0,1,-1', '-1,-1,3']);
  });

  it('round-trips through the tileset-aware reader', () => {
    const { map, ts, tl } = makeBasicMap();
    const csv = writeLayerCsv(map, tl);
    const recovered = readLayerCsv(csv, 'recovered', ts);
    expect(recovered.width).toBe(tl.width);
    expect(recovered.height).toBe(tl.height);
    expect(recovered.cellAt(0, 0).tileId).toBe(0);
    expect(recovered.cellAt(1, 0).tileId).toBe(1);
    expect(recovered.cellAt(2, 1).tileId).toBe(3);
    expect(recovered.cellAt(1, 1).isEmpty()).toBe(true);
  });

  it('emits flip-flag bits on the gid value', () => {
    const map = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    const ts = new Tileset('t', 16, 16);
    map.addTileset(ts);
    const tl = new TileLayer('main', 0, 0, 1, 1);
    const c = new Cell(ts, 5);
    c.setFlippedHorizontally(true);
    c.setFlippedVertically(true);
    tl.setCell(0, 0, c);
    map.addLayer(tl);

    const csv = writeLayerCsv(map, tl).trim();
    // 0x80000000 | 0x40000000 | 5 = 0xC0000005 → signed: -1073741819
    expect(csv).toBe('-1073741819');
  });

  it('produces one file per layer when there are multiple', () => {
    const map = new TiledMap({ width: 2, height: 1, tileWidth: 16, tileHeight: 16 });
    const ts = new Tileset('t', 16, 16);
    map.addTileset(ts);
    const a = new TileLayer('first', 0, 0, 2, 1);
    a.setCell(0, 0, new Cell(ts, 0));
    map.addLayer(a);
    const b = new TileLayer('second', 0, 0, 2, 1);
    b.setCell(1, 0, new Cell(ts, 1));
    map.addLayer(b);

    const files = writeCsv(map, 'm');
    expect(Object.keys(files).sort()).toEqual(['m_first.csv', 'm_second.csv']);
    expect(files['m_first.csv']?.trim()).toBe('0,-1');
    expect(files['m_second.csv']?.trim()).toBe('-1,1');
  });
});

describe('Lua plugin', () => {
  it('produces a parseable Lua document with expected sections', () => {
    const { map } = makeBasicMap();
    const text = writeMapLua(map);
    expect(text).toMatch(/^\s*return\s+\{/);
    expect(text).toContain('tilesets =');
    expect(text).toContain('layers =');
    expect(text).toContain('encoding = "lua"');
    // Map size has been emitted as numeric, not quoted.
    expect(text).toMatch(/width\s*=\s*3/);
    expect(text).toMatch(/height\s*=\s*2/);
  });

  it('round-trips structure & cells through readMapLua', () => {
    const { map } = makeBasicMap();
    const text = writeMapLua(map);
    const back = readMapLua(text);
    expect(back.width).toBe(map.width);
    expect(back.height).toBe(map.height);
    expect(back.tilesets.length).toBe(1);
    expect(back.layers.length).toBe(1);
    const tl = back.layers[0] as TileLayer;
    expect(tl.isTileLayer()).toBe(true);
    expect(tl.cellAt(0, 0).tileId).toBe(0);
    expect(tl.cellAt(1, 0).tileId).toBe(1);
    expect(tl.cellAt(2, 1).tileId).toBe(3);
    expect(back.property('description')?.kind).toBe('string');
  });

  it('serialises property values across types', () => {
    const map = new TiledMap({ width: 1, height: 1, tileWidth: 8, tileHeight: 8 });
    map.setProperty('s', Property.string('hello'));
    map.setProperty('i', Property.int(7));
    map.setProperty('b', Property.bool(true));
    map.setProperty('c', Property.color('#ff8800'));
    const text = writeMapLua(map);
    expect(text).toContain('["s"] = "hello"');
    expect(text).toContain('["i"] = 7');
    expect(text).toContain('["b"] = true');
    expect(text).toContain('["c"] = "#ff8800"');
  });
});

describe('JSON1 plugin', () => {
  it('emits flat layers and object-form properties', () => {
    const { map } = makeBasicMap();
    const og = new ObjectGroup('obj');
    map.addLayer(og);

    const j = writeMapJson1(map);
    expect(j.version).toBe(1.1);
    expect(Array.isArray(j.layers)).toBe(true);
    const layers = j.layers as unknown[];
    // tile layer + object group, flat at top level
    expect(layers.length).toBe(2);
    // properties is a record, not an array of {name,type,value}
    expect(typeof j.properties).toBe('object');
    expect(Array.isArray(j.properties)).toBe(false);
    expect((j.properties as Record<string, unknown>).description).toBe('hello');
    // propertytypes sibling carries the type info
    expect((j.propertytypes as Record<string, string>).description).toBe('string');
  });

  it('produces valid JSON that JSON.parse can round-trip', () => {
    const { map } = makeBasicMap();
    const j = writeMapJson1(map);
    const text = JSON.stringify(j);
    const parsed = JSON.parse(text);
    expect(parsed.tilesets.length).toBe(1);
    expect(parsed.tilesets[0].image).toBe('terrain.png');
    expect(parsed.tilesets[0].firstgid).toBe(1);
  });
});

describe('Defold plugin', () => {
  it('emits one cell block per non-empty cell', () => {
    const { map } = makeBasicMap();
    const text = writeDefold(map);
    const cellCount = (text.match(/cell \{/g) || []).length;
    expect(cellCount).toBe(3);
    expect(text).toContain('layers {');
    expect(text).toContain('tile_set:');
    expect(text).toContain('material:');
    expect(text).toContain('blend_mode: BLEND_MODE_ALPHA');
  });
});

describe('format registry', () => {
  it('looks up plugins by extension', () => {
    const registry = createBuiltinRegistry();
    expect(registry.findByExtension('csv')).toBe(csvPlugin);
    expect(registry.findByExtension('.csv')).toBe(csvPlugin);
    expect(registry.findByExtension('lua')).toBe(luaPlugin);
    expect(registry.findByExtension('json')).toBe(json1Plugin);
    expect(registry.findByExtension('tilemap')).toBe(defoldPlugin);
    expect(registry.findByExtension('gmx')).toBe(gmxPlugin);
    expect(registry.findByExtension('yy')).toBe(yyPlugin);
    expect(registry.findByExtension('txt')).toBe(txtPlugin);
  });

  it('also looks up by id', () => {
    const registry = createBuiltinRegistry();
    expect(registry.findById('lua')).toBe(luaPlugin);
    expect(registry.findById('json1')).toBe(json1Plugin);
    expect(registry.findById('nope')).toBeUndefined();
  });
});

describe('write smoke test', () => {
  it('every built-in plugin writes the example map without throwing', () => {
    const { map } = makeBasicMap();
    const registry = createBuiltinRegistry();
    for (const plugin of registry.all()) {
      const out = plugin.write(map);
      expect(Object.keys(out).length).toBeGreaterThan(0);
      for (const value of Object.values(out)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('GMX output contains the expected room shell', () => {
    const { map } = makeBasicMap();
    const gmx = writeGmx(map);
    expect(gmx).toContain('<room>');
    expect(gmx).toContain('</room>');
    expect(gmx).toContain('<tiles>');
    expect(gmx).toContain('isometric>0</isometric'); // orthogonal map
  });

  it('YY output is valid JSON with the expected tile-layer shape', () => {
    const { map } = makeBasicMap();
    const yy = writeYy(map);
    const parsed = JSON.parse(yy);
    expect(parsed.resourceType).toBe('GMRoom');
    expect(Array.isArray(parsed.layers)).toBe(true);
    expect(parsed.layers[0].resourceType).toBe('GMRTileLayer');
    expect(parsed.layers[0].tiles.SerialiseWidth).toBe(3);
    expect(parsed.layers[0].tiles.SerialiseHeight).toBe(2);
  });

  it('TXT output renders the layer grid', () => {
    const { map } = makeBasicMap();
    const txt = writeTxt(map);
    expect(txt).toContain('== Layer "main" (3x2) ==');
    expect(txt).toContain('0 1 .');
    expect(txt).toContain('. . 3');
  });
});

describe('flip flags via CellFlag', () => {
  it('readLayerCsv recovers flip bits stored in the gid', () => {
    const map = new TiledMap({ width: 1, height: 1, tileWidth: 8, tileHeight: 8 });
    const ts = new Tileset('t', 8, 8);
    map.addTileset(ts);
    const tl = new TileLayer('main', 0, 0, 1, 1);
    const c = new Cell(ts, 1);
    c.setFlippedHorizontally(true);
    c.setFlippedAntiDiagonally(true);
    tl.setCell(0, 0, c);
    map.addLayer(tl);

    const csv = writeLayerCsv(map, tl);
    const recovered = readLayerCsv(csv, 'r', ts);
    const rc = recovered.cellAt(0, 0);
    expect(rc.flippedHorizontally()).toBe(true);
    expect(rc.flippedAntiDiagonally()).toBe(true);
    expect(rc.flippedVertically()).toBe(false);
    // CellFlag is referenced to keep the import alive.
    expect(rc.rawFlags & CellFlag.FlippedHorizontally).toBeTruthy();
  });
});
