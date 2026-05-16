import { describe, expect, it } from 'vitest';

import {
  Cell,
  GroupLayer,
  ImageLayer,
  Map as TiledMap,
  ObjectGroup,
  TileLayer,
  TileRegion,
  Tileset,
} from '@tiled-ts/core';

import {
  AddLayer,
  MapDocument,
  PaintTileLayer,
  RemoveLayer,
  SetLayerName,
  SetLayerOpacity,
  SetLayerVisible,
  UndoStack,
} from '../src/index.js';

function makeDoc(): { doc: MapDocument; tl: TileLayer; ts: Tileset; map: TiledMap } {
  const map = new TiledMap({ width: 8, height: 8, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  const tl = new TileLayer('main', 0, 0, 8, 8);
  map.addLayer(tl);
  return { doc: new MapDocument(map), tl, ts, map };
}

describe('AddLayer/RemoveLayer', () => {
  it('round-trip leaves the map in its original state', () => {
    const { doc, map } = makeDoc();
    const stack = new UndoStack();
    const il = new ImageLayer('bg');
    const cmd = new AddLayer(doc, map.layerCount(), il);
    stack.push(cmd);
    expect(map.layerCount()).toBe(2);
    stack.undo();
    expect(map.layerCount()).toBe(1);
    stack.redo();
    expect(map.layerAt(1)).toBe(il);
  });

  it('removes and re-inserts at the same index', () => {
    const { doc, map } = makeDoc();
    map.addLayer(new ObjectGroup('o'));
    const stack = new UndoStack();
    const cmd = new RemoveLayer(doc, 1);
    stack.push(cmd);
    expect(map.layerCount()).toBe(1);
    stack.undo();
    expect(map.layerCount()).toBe(2);
    expect(map.layerAt(1)?.name).toBe('o');
  });
});

describe('ChangeLayer + merging', () => {
  it('SetLayerOpacity merges consecutive updates', () => {
    const { doc, tl } = makeDoc();
    const stack = new UndoStack();
    stack.push(new SetLayerOpacity(doc, tl, 0.9));
    stack.push(new SetLayerOpacity(doc, tl, 0.7));
    stack.push(new SetLayerOpacity(doc, tl, 0.4));
    expect(stack.count()).toBe(1); // all merged
    expect(tl.opacity).toBe(0.4);
    stack.undo();
    expect(tl.opacity).toBe(1); // original
  });

  it('different layer → no merge', () => {
    const { doc, map } = makeDoc();
    const other = new TileLayer('other', 0, 0, 8, 8);
    map.addLayer(other);
    const stack = new UndoStack();
    stack.push(new SetLayerName(doc, map.layerAt(0)!, 'first'));
    stack.push(new SetLayerName(doc, other, 'other-renamed'));
    expect(stack.count()).toBe(2);
  });

  it('SetLayerVisible round-trips', () => {
    const { doc, tl } = makeDoc();
    const stack = new UndoStack();
    stack.push(new SetLayerVisible(doc, tl, false));
    expect(tl.visible).toBe(false);
    stack.undo();
    expect(tl.visible).toBe(true);
  });
});

describe('PaintTileLayer', () => {
  it('paint then undo restores original cells', () => {
    const { doc, tl, ts } = makeDoc();
    tl.setCell(0, 0, new Cell(ts, 0));

    const source = new TileLayer('src', 0, 0, 2, 2);
    source.setCell(0, 0, new Cell(ts, 1));
    source.setCell(1, 0, new Cell(ts, 2));

    const region = TileRegion.fromRect({ x: 0, y: 0, width: 2, height: 1 });
    const cmd = new PaintTileLayer(doc);
    cmd.paint(tl, 0, 0, source, region);

    const stack = new UndoStack();
    stack.push(cmd);
    expect(tl.cellAt(0, 0).tileId).toBe(1);
    expect(tl.cellAt(1, 0).tileId).toBe(2);

    stack.undo();
    expect(tl.cellAt(0, 0).tileId).toBe(0); // restored
    expect(tl.cellAt(1, 0).isEmpty()).toBe(true);
  });

  it('merges paint strokes during a drag', () => {
    const { doc, tl, ts } = makeDoc();
    const stack = new UndoStack();
    const stroke1 = new PaintTileLayer(doc).setMergeable(true);
    stroke1.paint(
      tl,
      0,
      0,
      tileLayerWith(ts, [[1, 0, 0]]),
      TileRegion.fromRect({ x: 0, y: 0, width: 1, height: 1 }),
    );
    stack.push(stroke1);

    const stroke2 = new PaintTileLayer(doc).setMergeable(true);
    stroke2.paint(
      tl,
      0,
      0,
      tileLayerWith(ts, [[0, 1, 0]]),
      TileRegion.fromRect({ x: 1, y: 0, width: 1, height: 1 }),
    );
    stack.push(stroke2);

    expect(stack.count()).toBe(1);
    expect(tl.cellAt(0, 0).tileId).toBe(1);
    expect(tl.cellAt(1, 0).tileId).toBe(1);

    stack.undo();
    expect(tl.cellAt(0, 0).isEmpty()).toBe(true);
    expect(tl.cellAt(1, 0).isEmpty()).toBe(true);
  });
});

describe('GroupLayer host', () => {
  it('AddLayer into a group nests properly', () => {
    const { doc, map } = makeDoc();
    const group = new GroupLayer('grp');
    map.addLayer(group);
    const stack = new UndoStack();
    const child = new TileLayer('inside', 0, 0, 4, 4);
    stack.push(new AddLayer(doc, 0, child, group));
    expect(group.layerCount()).toBe(1);
    expect(child.parentLayer).toBe(group);
    stack.undo();
    expect(group.layerCount()).toBe(0);
  });
});

function tileLayerWith(ts: Tileset, cells: number[][]): TileLayer {
  const h = cells.length;
  const w = cells[0]?.length ?? 0;
  const layer = new TileLayer('src', 0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = cells[y]![x]!;
      if (id !== 0) layer.setCell(x, y, new Cell(ts, id));
    }
  }
  return layer;
}
