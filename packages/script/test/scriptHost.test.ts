import { describe, expect, it, vi } from 'vitest';

import {
  Cell,
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  TileLayer,
  Tileset,
} from '@tiled-ts/core';
import { MapDocument, type ChangeEvent } from '@tiled-ts/commands';

import {
  EditableMap,
  EditableMapObject,
  EditableObjectGroup,
  EditableTileLayer,
  RecordingConsole,
  ScriptHost,
} from '../src/index.js';

function makeMap(): TiledMap {
  const map = new TiledMap({ width: 8, height: 8, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  return map;
}

describe('ScriptHost.runScript', () => {
  it('runs a trivial script and returns tiled.version', () => {
    const host = new ScriptHost({ version: '1.10.0' });
    const result = host.runScript('return tiled.version;');
    expect(result).toBe('1.10.0');
  });

  it('does not leak Node globals (process is shadowed)', () => {
    const host = new ScriptHost();
    const result = host.runScript('return typeof process;');
    expect(result).toBe('undefined');
  });
});

describe('tiled.registerAction', () => {
  it('registers a callback from a script and lets the host invoke it', () => {
    const console = new RecordingConsole();
    const host = new ScriptHost({ console });
    host.runScript(`
      tiled.registerAction("hello", () => { tiled.log("ran"); });
    `);
    expect(host.api.actions).toContain('hello');

    const ok = host.invoke('hello');
    expect(ok).toBe(true);
    expect(console.entries).toContainEqual({ level: 'log', message: 'ran' });
  });

  it('host can register and call actions directly', () => {
    const host = new ScriptHost();
    const cb = vi.fn();
    host.register('do-thing', cb);
    expect(host.invoke('do-thing')).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('EditableMap setters', () => {
  it('pushes a command into the undo stack when a document is active', () => {
    const map = makeMap();
    const doc = new MapDocument(map);
    const host = new ScriptHost();
    host.setDocument(doc);

    const editable = host.api.activeAsset!;
    expect(editable).toBeInstanceOf(EditableMap);

    expect(doc.undoStack.count()).toBe(0);
    editable.tileWidth = 32;
    expect(map.tileWidth).toBe(32);
    expect(doc.undoStack.count()).toBe(1);

    doc.undoStack.undo();
    expect(map.tileWidth).toBe(16);
  });

  it('applies changes directly when no document is active', () => {
    const map = makeMap();
    const host = new ScriptHost();
    const editable = host.api.wrapMap(map);
    editable.tileWidth = 24;
    expect(map.tileWidth).toBe(24);
  });
});

describe('EditableTileLayer.setCell', () => {
  it('round-trips through the data model', () => {
    const map = makeMap();
    const ts = map.tilesetAt(0)!;
    const layer = new TileLayer('main', 0, 0, 8, 8);
    map.addLayer(layer);

    const host = new ScriptHost();
    const wrapped = new EditableTileLayer(layer);
    wrapped.host = host;

    const cell = new Cell(ts, 2);
    wrapped.setCell(3, 4, cell);

    const read = wrapped.cellAt(3, 4);
    expect(read.tileset).toBe(ts);
    expect(read.tileId).toBe(2);
  });

  it('routes through PaintTileLayer command when a doc is active', () => {
    const map = makeMap();
    const ts = map.tilesetAt(0)!;
    const layer = new TileLayer('main', 0, 0, 8, 8);
    map.addLayer(layer);

    const doc = new MapDocument(map);
    const host = new ScriptHost();
    host.setDocument(doc);

    const wrapped = new EditableTileLayer(layer);
    wrapped.host = host;

    wrapped.setCell(1, 1, new Cell(ts, 3));
    expect(doc.undoStack.count()).toBe(1);
    expect(layer.cellAt(1, 1).tileId).toBe(3);

    doc.undoStack.undo();
    expect(layer.cellAt(1, 1).isEmpty()).toBe(true);
  });
});

describe('EditableObjectGroup.addObject', () => {
  it('emits an objects-added event on the MapDocument', () => {
    const map = makeMap();
    const group = new ObjectGroup('objs');
    map.addLayer(group);

    const doc = new MapDocument(map);
    const host = new ScriptHost();
    host.setDocument(doc);

    const events: ChangeEvent[] = [];
    doc.subscribe((e) => events.push(e));

    const wrapped = new EditableObjectGroup(group);
    wrapped.host = host;

    const obj = new EditableMapObject('door');
    obj.host = host;
    wrapped.addObject(obj);

    const added = events.filter((e) => e.kind === 'objects-added');
    expect(added).toHaveLength(1);
    expect(added[0]!).toMatchObject({
      kind: 'objects-added',
      objectGroup: group,
    });
    expect((added[0] as { objects: MapObject[] }).objects).toHaveLength(1);
    expect((added[0] as { objects: MapObject[] }).objects[0]!.name).toBe('door');
  });

  it('applies addObject directly when no doc is set', () => {
    const map = makeMap();
    const group = new ObjectGroup('objs');
    map.addLayer(group);

    const host = new ScriptHost();
    const wrapped = new EditableObjectGroup(group);
    wrapped.host = host;

    const obj = new EditableMapObject('door');
    obj.shape = MapObjectShape.Rectangle;
    wrapped.addObject(obj);

    expect(group.objectCount()).toBe(1);
  });
});

describe('Console adapter', () => {
  it('receives tiled.alert / warn / error calls', () => {
    const console = new RecordingConsole();
    const host = new ScriptHost({ console });
    host.runScript(`
      tiled.alert("hello");
      tiled.warn("a warning");
      tiled.error("boom");
      tiled.log("ok");
    `);
    expect(console.entries.map((e) => `${e.level}:${e.message}`)).toEqual([
      'log:hello',
      'warn:a warning',
      'error:boom',
      'log:ok',
    ]);
  });
});

describe('EditableMapObject setter', () => {
  it('pushes SetObjectName onto the undo stack when a doc is active', () => {
    const map = makeMap();
    const group = new ObjectGroup('objs');
    const obj = new MapObject('original');
    group.addObject(obj);
    map.addLayer(group);

    const doc = new MapDocument(map);
    const host = new ScriptHost();
    host.setDocument(doc);

    const wrapped = new EditableMapObject(obj);
    wrapped.host = host;
    wrapped.name = 'renamed';
    expect(obj.name).toBe('renamed');
    expect(doc.undoStack.count()).toBe(1);
    doc.undoStack.undo();
    expect(obj.name).toBe('original');
  });
});
