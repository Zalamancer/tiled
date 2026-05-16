import { describe, expect, it } from 'vitest';

import {
  Cell,
  GroupLayer,
  ImageLayer,
  LayerDataFormat,
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  Property,
  Tile,
  TileLayer,
  Tileset,
  WangId,
  WangSet,
  WangSetType,
} from '@tiled-ts/core';
import { readMapJson, writeMapJson } from '../src/index.js';

function makeMap(): TiledMap {
  const map = new TiledMap({ width: 4, height: 3, tileWidth: 16, tileHeight: 16 });
  map.setLayerDataFormat(LayerDataFormat.Base64Zlib);
  map.setProperty('description', Property.string('hello'));

  const ts = new Tileset('terrain', 16, 16, 0, 0);
  ts.setColumnCount(4);
  ts.imageReference.source = 'terrain.png';
  ts.imageReference.size = { width: 64, height: 64 };
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);

  const ws = new WangSet(ts, 'grass', WangSetType.Mixed);
  ws.setColorCount(2);
  const id = new WangId();
  id.setIndexColor(0, 1);
  id.setIndexColor(2, 2);
  ws.setWangId(0, id);
  ts.addWangSet(ws);

  const tl = new TileLayer('main', 0, 0, 4, 3);
  tl.setCell(0, 0, new Cell(ts, 0));
  tl.setCell(1, 0, new Cell(ts, 1));
  tl.setCell(3, 2, new Cell(ts, 3));
  map.addLayer(tl);

  const og = new ObjectGroup('objects');
  const o1 = new MapObject('player', 'Player', { x: 16, y: 32 }, { width: 16, height: 16 });
  o1.setId(map.takeNextObjectId());
  og.addObject(o1);
  const o2 = new MapObject('point', '', { x: 4, y: 4 }, { width: 0, height: 0 });
  o2.setShape(MapObjectShape.Point);
  o2.setId(map.takeNextObjectId());
  og.addObject(o2);
  map.addLayer(og);

  const grp = new GroupLayer('grp');
  const il = new ImageLayer('bg');
  il.imageSource = 'bg.png';
  grp.addLayer(il);
  map.addLayer(grp);

  return map;
}

describe('TMJ round-trip', () => {
  it('preserves map structure across encode/decode', () => {
    const original = makeMap();
    const json = JSON.parse(JSON.stringify(writeMapJson(original)));
    const back = readMapJson(json);

    expect(back.width).toBe(original.width);
    expect(back.height).toBe(original.height);
    expect(back.tileWidth).toBe(original.tileWidth);
    expect(back.tileHeight).toBe(original.tileHeight);
    expect(back.property('description')).toEqual(Property.string('hello'));
    expect(back.layers.length).toBe(3);

    const tl = back.layers[0]!;
    expect(tl.isTileLayer()).toBe(true);
    const layer = tl as TileLayer;
    expect(layer.cellAt(0, 0).tileId).toBe(0);
    expect(layer.cellAt(1, 0).tileId).toBe(1);
    expect(layer.cellAt(3, 2).tileId).toBe(3);
    expect(layer.cellAt(2, 2).isEmpty()).toBe(true);

    const og = back.layers[1] as ObjectGroup;
    expect(og.objectCount()).toBe(2);
    expect(og.objectAt(1)!.shape).toBe(MapObjectShape.Point);

    const grp = back.layers[2] as GroupLayer;
    expect(grp.layerCount()).toBe(1);
    expect(grp.layerAt(0)!.isImageLayer()).toBe(true);
  });

  it('uses CSV encoding when chosen', () => {
    const m = makeMap();
    m.setLayerDataFormat(LayerDataFormat.CSV);
    const json = writeMapJson(m) as Record<string, unknown>;
    const layer = (json.layers as Record<string, unknown>[])[0]!;
    expect(layer.encoding).toBe('csv');
    expect(Array.isArray(layer.data)).toBe(true);
  });

  it('preserves wang set color & wang ids', () => {
    const m = makeMap();
    const json = JSON.parse(JSON.stringify(writeMapJson(m)));
    const back = readMapJson(json);
    const ts = back.tilesets[0]!;
    expect(ts.wangSetCount).toBe(1);
    const ws = ts.wangSet(0)!;
    expect(ws.colorCount()).toBe(2);
    const id = ws.wangIdByTileId().get(0);
    expect(id?.indexColor(0)).toBe(1);
    expect(id?.indexColor(2)).toBe(2);
  });
});
