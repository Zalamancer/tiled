import { describe, expect, it, vi } from 'vitest';

import {
  Cell,
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  type Point,
  Tile,
  Tileset,
} from '@tiled-ts/core';
import { MapDocument, type UndoCommand, UndoStack } from '@tiled-ts/commands';

import {
  CreateEllipseObjectTool,
  CreatePointObjectTool,
  CreatePolygonObjectTool,
  CreatePolylineObjectTool,
  CreateRectangleObjectTool,
  CreateTileObjectTool,
  EditPolygonTool,
  LayerOffsetTool,
  ObjectSelectionTool,
  hitTest,
  objectsAt,
  topMostObjectAt,
  type ToolContext,
} from '../src/index.js';

function makeWorld() {
  const map = new TiledMap({ width: 8, height: 8, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  ts.findOrCreateTile(0);
  map.addTileset(ts);
  const og = new ObjectGroup('objs');
  map.addLayer(og);
  const doc = new MapDocument(map);
  doc.setCurrentLayer(og);
  const stack = new UndoStack();
  const ctx: ToolContext = {
    doc,
    currentLayer: () => og,
    invalidate: vi.fn(),
    push: (c: UndoCommand) => stack.push(c),
  };
  return { map, ts, og, doc, stack, ctx };
}

const NO_MOD = { shift: false, ctrl: false, alt: false, meta: false };

function press(position: Point, button: 'left' | 'right' = 'left', buttons = 1, mods = NO_MOD) {
  return { position, tilePos: { x: position.x >> 4, y: position.y >> 4 }, button, buttons, modifiers: mods };
}

function move(position: Point, buttons = 1, mods = NO_MOD) {
  return {
    position,
    tilePos: { x: position.x >> 4, y: position.y >> 4 },
    button: undefined as 'left' | undefined,
    buttons,
    modifiers: mods,
  };
}

function release(position: Point, button: 'left' | 'right' = 'left', mods = NO_MOD) {
  return { position, tilePos: { x: position.x >> 4, y: position.y >> 4 }, button, buttons: 0, modifiers: mods };
}

describe('hitTest', () => {
  it('rectangle / ellipse / point / polygon basics', () => {
    const rect = new MapObject('r', '', { x: 10, y: 10 }, { width: 20, height: 20 });
    rect.setShape(MapObjectShape.Rectangle);
    expect(hitTest(rect, { x: 15, y: 15 })).toBe(true);
    expect(hitTest(rect, { x: 5, y: 5 })).toBe(false);

    const ell = new MapObject('e', '', { x: 0, y: 0 }, { width: 20, height: 20 });
    ell.setShape(MapObjectShape.Ellipse);
    expect(hitTest(ell, { x: 10, y: 10 })).toBe(true); // centre
    expect(hitTest(ell, { x: 0, y: 0 })).toBe(false); // corner is outside

    const pt = new MapObject('p', '', { x: 5, y: 5 }, { width: 0, height: 0 });
    pt.setShape(MapObjectShape.Point);
    expect(hitTest(pt, { x: 6, y: 6 })).toBe(true);
    expect(hitTest(pt, { x: 20, y: 20 })).toBe(false);

    const poly = new MapObject('g', '', { x: 0, y: 0 }, { width: 0, height: 0 });
    poly.setShape(MapObjectShape.Polygon);
    poly.setPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(hitTest(poly, { x: 5, y: 5 })).toBe(true);
    expect(hitTest(poly, { x: 20, y: 20 })).toBe(false);
  });

  it('objectsAt returns topmost first', () => {
    const og = new ObjectGroup('o');
    const a = new MapObject('a', '', { x: 0, y: 0 }, { width: 20, height: 20 });
    a.setShape(MapObjectShape.Rectangle);
    const b = new MapObject('b', '', { x: 5, y: 5 }, { width: 20, height: 20 });
    b.setShape(MapObjectShape.Rectangle);
    og.addObject(a);
    og.addObject(b);
    expect(objectsAt(og, { x: 10, y: 10 })[0]?.name).toBe('b');
    expect(topMostObjectAt(og, { x: 10, y: 10 })?.name).toBe('b');
  });
});

describe('CreateRectangleObjectTool', () => {
  it('drag creates a rectangle object with the expected size', () => {
    const { og, ctx, stack } = makeWorld();
    const tool = new CreateRectangleObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 10, y: 5 }));
    tool.pointerMove(move({ x: 40, y: 35 }));
    tool.pointerUp(release({ x: 40, y: 35 }));
    expect(og.objectCount()).toBe(1);
    const obj = og.objectAt(0)!;
    expect(obj.shape).toBe(MapObjectShape.Rectangle);
    expect(obj.bounds()).toEqual({ x: 10, y: 5, width: 30, height: 30 });
    expect(stack.count()).toBe(1);
  });

  it('right-click cancels mid-drag', () => {
    const { og, ctx } = makeWorld();
    const tool = new CreateRectangleObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 0, y: 0 }));
    tool.pointerMove(move({ x: 20, y: 20 }));
    tool.pointerDown(press({ x: 20, y: 20 }, 'right', 2));
    expect(og.objectCount()).toBe(0);
  });
});

describe('CreateEllipseObjectTool', () => {
  it('creates an ellipse shape', () => {
    const { og, ctx } = makeWorld();
    const tool = new CreateEllipseObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 0, y: 0 }));
    tool.pointerMove(move({ x: 40, y: 20 }));
    tool.pointerUp(release({ x: 40, y: 20 }));
    expect(og.objectAt(0)?.shape).toBe(MapObjectShape.Ellipse);
    expect(og.objectAt(0)?.bounds()).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });
});

describe('CreatePointObjectTool', () => {
  it('single click drops a point at the exact pixel', () => {
    const { og, ctx, stack } = makeWorld();
    const tool = new CreatePointObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 17, y: 23 }));
    expect(og.objectCount()).toBe(1);
    expect(og.objectAt(0)?.shape).toBe(MapObjectShape.Point);
    expect(og.objectAt(0)?.position).toEqual({ x: 17, y: 23 });
    expect(stack.count()).toBe(1);
  });
});

describe('CreatePolygonObjectTool', () => {
  it('accumulates vertices and finishes on right-click', () => {
    const { og, ctx, stack } = makeWorld();
    const tool = new CreatePolygonObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 10, y: 10 })); // anchor
    tool.pointerDown(press({ x: 30, y: 10 })); // vertex 2
    tool.pointerDown(press({ x: 20, y: 30 })); // vertex 3
    tool.pointerDown(press({ x: 0, y: 0 }, 'right', 2)); // finish
    expect(og.objectCount()).toBe(1);
    const obj = og.objectAt(0)!;
    expect(obj.shape).toBe(MapObjectShape.Polygon);
    expect(obj.polygon).toHaveLength(3);
    expect(obj.position).toEqual({ x: 10, y: 10 });
    expect(stack.count()).toBe(1);
  });

  it('Escape cancels in-progress polygon', () => {
    const { og, ctx } = makeWorld();
    const tool = new CreatePolygonObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 10, y: 10 }));
    tool.pointerDown(press({ x: 30, y: 10 }));
    tool.keyDown('Escape', NO_MOD);
    expect(og.objectCount()).toBe(0);
  });

  it('polyline tool emits Polyline shape', () => {
    const { og, ctx } = makeWorld();
    const tool = new CreatePolylineObjectTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 0, y: 0 }));
    tool.pointerDown(press({ x: 50, y: 0 }));
    tool.keyDown('Enter', NO_MOD);
    expect(og.objectAt(0)?.shape).toBe(MapObjectShape.Polyline);
  });
});

describe('CreateTileObjectTool', () => {
  it('drags out a tile-bound object', () => {
    const { og, ts, ctx, stack } = makeWorld();
    const tile = new Tile(0, ts);
    tile.imageRect = { x: 0, y: 0, width: 16, height: 16 };
    const tool = new CreateTileObjectTool();
    tool.selectedTile = tile;
    tool.activate(ctx);
    tool.pointerDown(press({ x: 10, y: 10 }));
    tool.pointerMove(move({ x: 30, y: 30 }));
    tool.pointerUp(release({ x: 30, y: 30 }));
    expect(og.objectCount()).toBe(1);
    const obj = og.objectAt(0)!;
    expect(obj.isTileObject()).toBe(true);
    expect(obj.cell.tileId).toBe(0);
    expect(stack.count()).toBe(1);
    void Cell;
  });
});

describe('ObjectSelectionTool', () => {
  it('click selects topmost object, shift adds to selection', () => {
    const { og, doc, ctx } = makeWorld();
    const a = new MapObject('a', '', { x: 0, y: 0 }, { width: 20, height: 20 });
    a.setShape(MapObjectShape.Rectangle);
    const b = new MapObject('b', '', { x: 30, y: 0 }, { width: 20, height: 20 });
    b.setShape(MapObjectShape.Rectangle);
    og.addObject(a);
    og.addObject(b);
    const tool = new ObjectSelectionTool();
    tool.activate(ctx);

    tool.pointerDown(press({ x: 10, y: 10 }));
    tool.pointerUp(release({ x: 10, y: 10 }));
    expect(doc.selectedObjects.has(a)).toBe(true);

    tool.pointerDown(press({ x: 40, y: 10 }, 'left', 1, { ...NO_MOD, shift: true }));
    tool.pointerUp(release({ x: 40, y: 10 }, 'left', { ...NO_MOD, shift: true }));
    expect(doc.selectedObjects.size).toBe(2);
  });

  it('drag moves selected objects and commits one undo entry', () => {
    const { og, doc, ctx, stack } = makeWorld();
    const a = new MapObject('a', '', { x: 0, y: 0 }, { width: 20, height: 20 });
    a.setShape(MapObjectShape.Rectangle);
    og.addObject(a);
    doc.selectedObjects.add(a);
    const tool = new ObjectSelectionTool();
    tool.activate(ctx);

    tool.pointerDown(press({ x: 5, y: 5 }));
    tool.pointerMove(move({ x: 35, y: 25 }));
    tool.pointerUp(release({ x: 35, y: 25 }));

    expect(a.position).toEqual({ x: 30, y: 20 });
    expect(stack.count()).toBe(1);
    stack.undo();
    expect(a.position).toEqual({ x: 0, y: 0 });
  });

  it('marquee drag selects objects whose bounds intersect', () => {
    const { og, doc, ctx } = makeWorld();
    const a = new MapObject('a', '', { x: 5, y: 5 }, { width: 10, height: 10 });
    a.setShape(MapObjectShape.Rectangle);
    const b = new MapObject('b', '', { x: 100, y: 100 }, { width: 5, height: 5 });
    b.setShape(MapObjectShape.Rectangle);
    og.addObject(a);
    og.addObject(b);
    const tool = new ObjectSelectionTool();
    tool.activate(ctx);

    tool.pointerDown(press({ x: 0, y: 0 }));
    tool.pointerMove(move({ x: 50, y: 50 }));
    tool.pointerUp(release({ x: 50, y: 50 }));

    expect(doc.selectedObjects.has(a)).toBe(true);
    expect(doc.selectedObjects.has(b)).toBe(false);
  });
});

describe('EditPolygonTool', () => {
  it('drags a vertex to a new position', () => {
    const { og, ctx } = makeWorld();
    const poly = new MapObject('p', '', { x: 0, y: 0 }, { width: 0, height: 0 });
    poly.setShape(MapObjectShape.Polygon);
    poly.setPolygon([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 10, y: 20 },
    ]);
    og.addObject(poly);

    const tool = new EditPolygonTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 5, y: 5 })); // select the polygon
    tool.pointerDown(press({ x: 0, y: 0 })); // hit vertex 0
    tool.pointerMove(move({ x: 5, y: 5 }));
    tool.pointerUp(release({ x: 5, y: 5 }));
    expect(poly.polygon[0]).toEqual({ x: 5, y: 5 });
  });
});

describe('LayerOffsetTool', () => {
  it('drags the active layer offset and pushes one undo entry', () => {
    const { og, ctx, stack } = makeWorld();
    expect(og.offset).toEqual({ x: 0, y: 0 });
    const tool = new LayerOffsetTool();
    tool.activate(ctx);
    tool.pointerDown(press({ x: 10, y: 10 }));
    tool.pointerMove(move({ x: 25, y: 30 }));
    tool.pointerUp(release({ x: 25, y: 30 }));
    expect(og.offset).toEqual({ x: 15, y: 20 });
    expect(stack.count()).toBe(1);
    stack.undo();
    expect(og.offset).toEqual({ x: 0, y: 0 });
  });
});
