import { describe, expect, it } from 'vitest';

import {
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  Tile,
  Tileset,
} from '@tiled-ts/core';

import {
  ChangeTileAnimation,
  ChangeTileObjectGroup,
  ChangeTileProbability,
  ChangeTileType,
  MapDocument,
  UndoStack,
} from '../src/index.js';

function makeDoc(): { doc: MapDocument; ts: Tileset; tile: Tile } {
  const map = new TiledMap();
  const ts = new Tileset('t', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  return { doc: new MapDocument(map), ts, tile: ts.findTile(0)! };
}

describe('ChangeTileAnimation', () => {
  it('round-trips frames through redo/undo', () => {
    const { doc, tile } = makeDoc();
    const stack = new UndoStack();
    expect(tile.frames).toHaveLength(0);
    stack.push(
      new ChangeTileAnimation(doc, tile, [
        { tileId: 0, duration: 100 },
        { tileId: 1, duration: 80 },
      ]),
    );
    expect(tile.frames).toHaveLength(2);
    expect(tile.frames[0]).toEqual({ tileId: 0, duration: 100 });
    stack.undo();
    expect(tile.frames).toHaveLength(0);
  });
});

describe('ChangeTileProbability', () => {
  it('merges adjacent probability changes', () => {
    const { doc, tile } = makeDoc();
    const stack = new UndoStack();
    stack.push(new ChangeTileProbability(doc, tile, 0.5));
    stack.push(new ChangeTileProbability(doc, tile, 0.2));
    stack.push(new ChangeTileProbability(doc, tile, 0.1));
    expect(stack.count()).toBe(1);
    expect(tile.probability).toBe(0.1);
    stack.undo();
    expect(tile.probability).toBe(1);
  });
});

describe('ChangeTileType (className)', () => {
  it('sets and undoes the tile className', () => {
    const { doc, tile } = makeDoc();
    const stack = new UndoStack();
    stack.push(new ChangeTileType(doc, tile, 'Enemy'));
    expect(tile.className).toBe('Enemy');
    stack.undo();
    expect(tile.className).toBe('');
  });
});

describe('ChangeTileObjectGroup', () => {
  it('clones on apply so subsequent edits do not bleed back', () => {
    const { doc, tile } = makeDoc();
    const og = new ObjectGroup('Collision');
    const obj = new MapObject('rect', '', { x: 0, y: 0 }, { width: 16, height: 16 });
    obj.setShape(MapObjectShape.Rectangle);
    og.addObject(obj);

    const stack = new UndoStack();
    stack.push(new ChangeTileObjectGroup(doc, tile, og));
    expect(tile.objectGroup?.objectCount()).toBe(1);

    // Modify the original — tile's clone should be untouched.
    og.addObject(new MapObject('rect2', '', { x: 0, y: 0 }, { width: 16, height: 16 }));
    expect(tile.objectGroup?.objectCount()).toBe(1);

    stack.undo();
    expect(tile.objectGroup).toBeUndefined();
  });

  it('clearing collision (passing undefined) and undoing restores the group', () => {
    const { doc, tile } = makeDoc();
    const og = new ObjectGroup('Collision');
    const obj = new MapObject('r', '', { x: 0, y: 0 }, { width: 16, height: 16 });
    obj.setShape(MapObjectShape.Rectangle);
    og.addObject(obj);
    tile.objectGroup = og.clone() as ObjectGroup;

    const stack = new UndoStack();
    stack.push(new ChangeTileObjectGroup(doc, tile, undefined));
    expect(tile.objectGroup).toBeUndefined();
    stack.undo();
    expect(tile.objectGroup?.objectCount()).toBe(1);
  });
});
