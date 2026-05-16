import { describe, expect, it } from 'vitest';

import {
  Map as TiledMap,
  MapObject,
  ObjectGroup,
  Property,
  Tileset,
  WangSet,
  WangSetType,
  WangId,
} from '@tiled-ts/core';

import {
  AddMapObjects,
  AddTileset,
  AddWangSet,
  MapDocument,
  RemoveMapObjects,
  RemoveTileset,
  RenameProperty,
  SetMapBackgroundColor,
  SetObjectPosition,
  SetObjectRotation,
  SetProperty,
  SetTileWangId,
  SetWangSetColorCount,
  UndoStack,
} from '../src/index.js';

function makeDoc(): { doc: MapDocument; map: TiledMap; ts: Tileset } {
  const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  map.addTileset(ts);
  return { doc: new MapDocument(map), map, ts };
}

describe('AddMapObjects / RemoveMapObjects', () => {
  it('preserves indexes through redo/undo', () => {
    const { doc, map } = makeDoc();
    const og = new ObjectGroup('o');
    map.addLayer(og);
    const obj = new MapObject('foo', '', { x: 0, y: 0 }, { width: 16, height: 16 });
    const stack = new UndoStack();
    stack.push(new AddMapObjects(doc, og, [obj]));
    expect(og.objectCount()).toBe(1);
    expect(obj.id).toBeGreaterThan(0);

    stack.push(new RemoveMapObjects(doc, [obj]));
    expect(og.objectCount()).toBe(0);
    stack.undo();
    expect(og.objectCount()).toBe(1);
    stack.undo();
    expect(og.objectCount()).toBe(0);
  });
});

describe('Change MapObject (position/rotation merging)', () => {
  it('merges consecutive position changes', () => {
    const { doc, map } = makeDoc();
    const og = new ObjectGroup('o');
    map.addLayer(og);
    const obj = new MapObject('foo', '', { x: 0, y: 0 }, { width: 16, height: 16 });
    og.addObject(obj);

    const stack = new UndoStack();
    stack.push(new SetObjectPosition(doc, obj, { x: 10, y: 0 }));
    stack.push(new SetObjectPosition(doc, obj, { x: 20, y: 5 }));
    stack.push(new SetObjectPosition(doc, obj, { x: 30, y: 30 }));
    expect(stack.count()).toBe(1);
    expect(obj.x).toBe(30);
    stack.undo();
    expect(obj.x).toBe(0);
  });

  it('SetObjectRotation round-trips', () => {
    const { doc, map } = makeDoc();
    const og = new ObjectGroup('o');
    map.addLayer(og);
    const obj = new MapObject('r', '', { x: 0, y: 0 }, { width: 16, height: 16 });
    og.addObject(obj);
    const stack = new UndoStack();
    stack.push(new SetObjectRotation(doc, obj, 45));
    expect(obj.rotation).toBe(45);
    stack.undo();
    expect(obj.rotation).toBe(0);
  });
});

describe('Tileset commands', () => {
  it('AddTileset/RemoveTileset round-trip', () => {
    const { doc, map } = makeDoc();
    const ts = new Tileset('extra', 16, 16);
    const stack = new UndoStack();
    stack.push(new AddTileset(doc, ts));
    expect(map.tilesetCount()).toBe(2);
    stack.push(new RemoveTileset(doc, ts));
    expect(map.tilesetCount()).toBe(1);
    stack.undo();
    expect(map.tilesetCount()).toBe(2);
    stack.undo();
    expect(map.tilesetCount()).toBe(1);
  });
});

describe('Property commands', () => {
  it('SetProperty merges and undoes correctly', () => {
    const { doc, map } = makeDoc();
    const stack = new UndoStack();
    stack.push(new SetProperty(doc, map, 'health', Property.int(10)));
    stack.push(new SetProperty(doc, map, 'health', Property.int(20)));
    expect(stack.count()).toBe(1); // merged
    expect(map.property('health')).toEqual(Property.int(20));
    stack.undo();
    expect(map.hasProperty('health')).toBe(false);
  });

  it('RenameProperty preserves value', () => {
    const { doc, map } = makeDoc();
    map.setProperty('a', Property.string('hi'));
    const stack = new UndoStack();
    stack.push(new RenameProperty(doc, map, 'a', 'b'));
    expect(map.property('b')).toEqual(Property.string('hi'));
    expect(map.hasProperty('a')).toBe(false);
    stack.undo();
    expect(map.property('a')).toEqual(Property.string('hi'));
  });
});

describe('Map property commands', () => {
  it('SetMapBackgroundColor merges', () => {
    const { doc, map } = makeDoc();
    const stack = new UndoStack();
    stack.push(new SetMapBackgroundColor(doc, '#ff0000'));
    stack.push(new SetMapBackgroundColor(doc, '#00ff00'));
    expect(stack.count()).toBe(1);
    expect(map.backgroundColor).toBe('#00ff00');
    stack.undo();
    expect(map.backgroundColor).toBeUndefined();
  });
});

describe('WangSet commands', () => {
  it('AddWangSet / SetWangSetColorCount / SetTileWangId', () => {
    const { doc, ts } = makeDoc();
    const ws = new WangSet(ts, 'edges', WangSetType.Edge);
    const stack = new UndoStack();
    stack.push(new AddWangSet(doc, ts, ws));
    expect(ts.wangSetCount).toBe(1);

    stack.push(new SetWangSetColorCount(doc, ts, ws, 3));
    expect(ws.colorCount()).toBe(3);

    const id = new WangId();
    id.setEdgeColor(0, 1);
    stack.push(new SetTileWangId(doc, ts, ws, 0, id));
    expect(ws.wangIdByTileId().get(0)?.indexColor(0)).toBe(1);

    stack.undo();
    expect(ws.wangIdByTileId().get(0)).toBeUndefined();
  });
});
