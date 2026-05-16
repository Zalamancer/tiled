import { describe, expect, it } from 'vitest';

import {
  Cell,
  Map as TiledMap,
  TileLayer,
  Tileset,
  WangId,
  WangIndex,
  WangSet,
  WangSetType,
} from '@tiled-ts/core';
import { MapDocument, type UndoCommand, UndoStack } from '@tiled-ts/commands';

import { WangBrush, WangFiller, type ToolContext } from '../src/index.js';

function makeWorld() {
  const map = new TiledMap({ width: 6, height: 6, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  for (let i = 0; i < 16; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);

  // Tiny corner wang set with two colors.
  const ws = new WangSet(ts, 'grass', WangSetType.Corner);
  ws.setColorCount(2);
  // Tile 0: all corners color 1
  const allOnes = new WangId();
  for (let i = 0; i < 4; i++) allOnes.setCornerColor(i, 1);
  ws.setWangId(0, allOnes);
  // Tile 1: all corners color 2
  const allTwos = new WangId();
  for (let i = 0; i < 4; i++) allTwos.setCornerColor(i, 2);
  ws.setWangId(1, allTwos);
  // Tile 2: top corners 1, bottom corners 2
  const mix = new WangId();
  mix.setCornerColor(0, 1); // top-right
  mix.setCornerColor(3, 1); // top-left
  mix.setCornerColor(1, 2); // bottom-right
  mix.setCornerColor(2, 2); // bottom-left
  ws.setWangId(2, mix);
  // Tile 3: only bottom-right is color 2 — exact match when the BR corner is painted.
  const onlyBR = new WangId();
  onlyBR.setCornerColor(0, 1); // TR=1
  onlyBR.setCornerColor(1, 2); // BR=2
  onlyBR.setCornerColor(2, 1); // BL=1
  onlyBR.setCornerColor(3, 1); // TL=1
  ws.setWangId(3, onlyBR);
  // Tile 4: only bottom-left is color 2 — exact match for the (3,2) cell.
  const onlyBL = new WangId();
  onlyBL.setCornerColor(0, 1);
  onlyBL.setCornerColor(1, 1);
  onlyBL.setCornerColor(2, 2);
  onlyBL.setCornerColor(3, 1);
  ws.setWangId(4, onlyBL);
  // Tile 5: only top-right is color 2 — exact match for (2,3).
  const onlyTR = new WangId();
  onlyTR.setCornerColor(0, 2);
  onlyTR.setCornerColor(1, 1);
  onlyTR.setCornerColor(2, 1);
  onlyTR.setCornerColor(3, 1);
  ws.setWangId(5, onlyTR);
  // Tile 6: only top-left is color 2 — exact match for (3,3).
  const onlyTL = new WangId();
  onlyTL.setCornerColor(0, 1);
  onlyTL.setCornerColor(1, 1);
  onlyTL.setCornerColor(2, 1);
  onlyTL.setCornerColor(3, 2);
  ws.setWangId(6, onlyTL);

  ts.addWangSet(ws);

  const layer = new TileLayer('main', 0, 0, 6, 6);
  // Pre-fill with tile 0 (all color 1) so neighbours have meaningful wangIds.
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) layer.setCell(x, y, new Cell(ts, 0));
  map.addLayer(layer);

  const doc = new MapDocument(map);
  const stack = new UndoStack();
  const ctx: ToolContext = {
    doc,
    currentLayer: () => layer,
    invalidate: () => {},
    push: (c: UndoCommand) => stack.push(c),
  };
  return { map, ts, ws, layer, ctx, stack };
}

describe('WangFiller', () => {
  it('picks the exact match tile when the desired wangId fully matches', () => {
    const { ws, layer } = makeWorld();
    const filler = new WangFiller({ wangSet: ws, baseLayer: layer });
    // Request all corners = color 2 at cell (2,2).
    for (let i = 0; i < 4; i++) filler.setIndex(2, 2, (i * 2 + 1) as unknown as WangIndex, 2);
    const out = new TileLayer('out', 0, 0, 6, 6);
    filler.apply(out);
    expect(out.cellAt(2, 2).tileId).toBe(1);
  });

  it('returns empty for cells with no compatible tile', () => {
    const { ws, layer, ts } = makeWorld();
    // Remove the all-twos tile to force impossibility for color 3.
    ws.setColorCount(3);
    const filler = new WangFiller({ wangSet: ws, baseLayer: layer });
    for (let i = 0; i < 4; i++) filler.setIndex(2, 2, (i * 2 + 1) as unknown as WangIndex, 3);
    const out = new TileLayer('out', 0, 0, 6, 6);
    filler.apply(out);
    expect(out.cellAt(2, 2).isEmpty()).toBe(true);
    void ts;
  });
});

describe('WangBrush (corner mode)', () => {
  it('pointerDown paints the 4 cells around the nearest corner', () => {
    const { ts, ws, layer, ctx, stack } = makeWorld();
    const brush = new WangBrush();
    brush.wangSet = ws;
    brush.color = 2;
    brush.mode = 'corner';
    brush.activate(ctx);

    // Click in the middle of a corner shared by 4 cells (e.g., between (2,2) and (3,3)).
    brush.pointerDown({
      position: { x: 3 * 16, y: 3 * 16 }, // pixel = exactly on the (3,3) corner
      tilePos: { x: 3, y: 3 },
      button: 'left',
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    brush.pointerUp({
      position: { x: 48, y: 48 },
      tilePos: { x: 3, y: 3 },
      button: 'left',
      buttons: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });

    expect(stack.count()).toBe(1);
    // Each of the 4 cells around the (3,3) corner becomes the tile whose
    // single color-2 corner sits at the clicked vertex.
    expect(layer.cellAt(2, 2).tileId).toBe(3); // BR=2
    expect(layer.cellAt(3, 2).tileId).toBe(4); // BL=2
    expect(layer.cellAt(2, 3).tileId).toBe(5); // TR=2
    expect(layer.cellAt(3, 3).tileId).toBe(6); // TL=2
    void ts;
  });
});
