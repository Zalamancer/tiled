import { describe, expect, it, vi } from 'vitest';

import {
  Cell,
  Map as TiledMap,
  TileLayer,
  Tileset,
} from '@tiled-ts/core';
import { MapDocument, type UndoCommand, UndoStack } from '@tiled-ts/commands';

import {
  BucketFillTool,
  EraserTool,
  ShapeFillTool,
  StampBrush,
  TileStamp,
  type ToolContext,
} from '../src/index.js';

function makeWorld(layerInit?: (l: TileLayer, ts: Tileset) => void) {
  const map = new TiledMap({ width: 8, height: 8, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  const layer = new TileLayer('main', 0, 0, 8, 8);
  layerInit?.(layer, ts);
  map.addLayer(layer);
  const doc = new MapDocument(map);
  const stack = new UndoStack();
  const invalidates = vi.fn();
  const ctx: ToolContext = {
    doc,
    currentLayer: () => layer,
    invalidate: invalidates,
    push: (c: UndoCommand) => stack.push(c),
  };
  return { map, ts, layer, doc, stack, ctx, invalidates };
}

function stampOf(ts: Tileset, tileId: number): TileStamp {
  const v = new TileLayer('v', 0, 0, 1, 1);
  v.setCell(0, 0, new Cell(ts, tileId));
  const stamp = new TileStamp();
  stamp.addVariation(v);
  return stamp;
}

describe('StampBrush', () => {
  it('paints on pointer-down and merges drag into a single undo entry', () => {
    const { ts, layer, ctx, stack } = makeWorld();
    const brush = new StampBrush();
    brush.stamp = stampOf(ts, 1);
    brush.activate(ctx);

    brush.pointerDown({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: 'left',
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    brush.pointerMove({
      position: { x: 32, y: 0 },
      tilePos: { x: 2, y: 0 },
      button: undefined,
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    brush.pointerUp({
      position: { x: 32, y: 0 },
      tilePos: { x: 2, y: 0 },
      button: 'left',
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });

    expect(stack.count()).toBe(1);
    expect(layer.cellAt(0, 0).tileId).toBe(1);
    expect(layer.cellAt(2, 0).tileId).toBe(1);

    stack.undo();
    expect(layer.cellAt(0, 0).isEmpty()).toBe(true);
    expect(layer.cellAt(2, 0).isEmpty()).toBe(true);
  });

  it('right-button stroke erases', () => {
    const { ts, layer, ctx, stack } = makeWorld((l, tset) => {
      l.setCell(0, 0, new Cell(tset, 0));
    });
    const brush = new StampBrush();
    brush.stamp = stampOf(ts, 1);
    brush.activate(ctx);
    brush.pointerDown({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: 'right',
      buttons: 2,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    brush.pointerUp({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: 'right',
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    expect(layer.cellAt(0, 0).isEmpty()).toBe(true);
    stack.undo();
    expect(layer.cellAt(0, 0).tileId).toBe(0);
  });
});

describe('BucketFillTool', () => {
  it('floods a connected region of identical cells', () => {
    const { ts, layer, ctx, stack } = makeWorld((l, tset) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) l.setCell(x, y, new Cell(tset, 0));
    });
    const tool = new BucketFillTool();
    tool.stamp = stampOf(ts, 2);
    tool.activate(ctx);

    tool.pointerMove({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: undefined,
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerDown({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: 'left',
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });

    let filled = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (layer.cellAt(x, y).tileId === 2) filled += 1;
    expect(filled).toBe(64);
    expect(stack.count()).toBe(1);

    stack.undo();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(layer.cellAt(x, y).tileId).toBe(0);
  });
});

describe('EraserTool', () => {
  it('erases cells along a drag', () => {
    const { layer, ts, ctx, stack } = makeWorld((l, tset) => {
      l.setCell(1, 1, new Cell(tset, 1));
      l.setCell(2, 1, new Cell(tset, 1));
      l.setCell(3, 1, new Cell(tset, 1));
    });
    const tool = new EraserTool();
    tool.activate(ctx);
    tool.pointerDown({
      position: { x: 16, y: 16 },
      tilePos: { x: 1, y: 1 },
      button: 'left',
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerMove({
      position: { x: 32, y: 16 },
      tilePos: { x: 2, y: 1 },
      button: undefined,
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerMove({
      position: { x: 48, y: 16 },
      tilePos: { x: 3, y: 1 },
      button: undefined,
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerUp({
      position: { x: 48, y: 16 },
      tilePos: { x: 3, y: 1 },
      button: 'left',
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    expect(layer.cellAt(1, 1).isEmpty()).toBe(true);
    expect(layer.cellAt(2, 1).isEmpty()).toBe(true);
    expect(layer.cellAt(3, 1).isEmpty()).toBe(true);
    stack.undo();
    expect(layer.cellAt(1, 1).tileId).toBe(1);
    expect(layer.cellAt(2, 1).tileId).toBe(1);
    expect(layer.cellAt(3, 1).tileId).toBe(1);
    void ts; // unused
  });
});

describe('ShapeFillTool', () => {
  it('fills a rectangle on drag', () => {
    const { ts, layer, ctx, stack } = makeWorld();
    const tool = new ShapeFillTool();
    tool.stamp = stampOf(ts, 1);
    tool.shape = 'rectangle';
    tool.activate(ctx);

    tool.pointerDown({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: 'left',
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerMove({
      position: { x: 32, y: 32 },
      tilePos: { x: 2, y: 2 },
      button: undefined,
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerUp({
      position: { x: 32, y: 32 },
      tilePos: { x: 2, y: 2 },
      button: 'left',
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });

    let count = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (layer.cellAt(x, y).tileId === 1) count += 1;
    expect(count).toBe(9); // 3×3 rect
    expect(stack.count()).toBe(1);
  });

  it('ellipse fills only cells inside the disc', () => {
    const { ts, layer, ctx } = makeWorld();
    const tool = new ShapeFillTool();
    tool.stamp = stampOf(ts, 1);
    tool.shape = 'ellipse';
    tool.activate(ctx);
    tool.pointerDown({
      position: { x: 0, y: 0 },
      tilePos: { x: 0, y: 0 },
      button: 'left',
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerMove({
      position: { x: 64, y: 64 },
      tilePos: { x: 4, y: 4 },
      button: undefined,
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    tool.pointerUp({
      position: { x: 64, y: 64 },
      tilePos: { x: 4, y: 4 },
      button: 'left',
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    // Corners of the bounding 5×5 should NOT be filled for an ellipse.
    expect(layer.cellAt(0, 0).isEmpty()).toBe(true);
    expect(layer.cellAt(4, 4).isEmpty()).toBe(true);
    expect(layer.cellAt(2, 2).tileId).toBe(1); // centre
  });
});
