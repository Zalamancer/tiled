import { describe, expect, it } from 'vitest';

import {
  Cell,
  Map as TiledMap,
  TileLayer,
  TileRegion,
  Tileset,
} from '@tiled-ts/core';
import { MapDocument, PaintTileLayer, UndoStack } from '@tiled-ts/commands';

import { AutoMapper, AutoMappingManager } from '../src/index.js';

/* ───────────────────────── shared fixtures ───────────────────────────── */

/** Create a tileset with `n` tiles using the same dimensions. */
function makeTileset(name = 't', n = 16): Tileset {
  const ts = new Tileset(name, 16, 16);
  for (let i = 0; i < n; i++) ts.findOrCreateTile(i);
  return ts;
}

/** Create a fresh map containing just `floor`/`walls` layers. */
function makeTargetMap(width = 6, height = 6): { map: TiledMap; ts: Tileset } {
  const map = new TiledMap({ width, height, tileWidth: 16, tileHeight: 16 });
  const ts = makeTileset();
  map.addTileset(ts);
  const floor = new TileLayer('floor', 0, 0, width, height);
  const walls = new TileLayer('walls', 0, 0, width, height);
  map.addLayer(floor);
  map.addLayer(walls);
  return { map, ts };
}

/**
 * Build a rules-map containing an `input_floor` layer and an `output_walls`
 * layer of the given width/height. Returns the rules map + the two layers
 * so the test can stamp cells in.
 */
function makeOneRuleMap(
  ts: Tileset,
  ruleW = 1,
  ruleH = 1,
): {
  rulesMap: TiledMap;
  inputFloor: TileLayer;
  outputWalls: TileLayer;
} {
  const rulesMap = new TiledMap({
    width: ruleW,
    height: ruleH,
    tileWidth: 16,
    tileHeight: 16,
  });
  rulesMap.addTileset(ts);
  const inputFloor = new TileLayer('input_floor', 0, 0, ruleW, ruleH);
  const outputWalls = new TileLayer('output_walls', 0, 0, ruleW, ruleH);
  rulesMap.addLayer(inputFloor);
  rulesMap.addLayer(outputWalls);
  return { rulesMap, inputFloor, outputWalls };
}

/* ───────────────────────────── tests ─────────────────────────────────── */

describe('AutoMapper.fromRulesMap', () => {
  it('classifies input, inputnot and output layers by name', () => {
    const ts = makeTileset();
    const rulesMap = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    rulesMap.addTileset(ts);

    const inFloor = new TileLayer('input_floor', 0, 0, 1, 1);
    const inNotFloor = new TileLayer('inputnot_floor', 0, 0, 1, 1);
    const outWalls = new TileLayer('output_walls', 0, 0, 1, 1);
    inFloor.setCell(0, 0, new Cell(ts, 0));
    outWalls.setCell(0, 0, new Cell(ts, 1));

    rulesMap.addLayer(inFloor);
    rulesMap.addLayer(inNotFloor);
    rulesMap.addLayer(outWalls);

    const mapper = AutoMapper.fromRulesMap(rulesMap);
    expect(mapper.errors()).toEqual([]);
    expect(mapper.ruleLayerNameUsed('floor')).toBe(true);
    expect(mapper.outputLayerNames()).toContain('walls');

    // The parser must have created exactly one InputSet with one
    // InputConditions group that has both listYes and listNo populated.
    const set = mapper.setup.inputSets[0]!;
    expect(set.layers).toHaveLength(1);
    expect(set.layers[0]!.listYes).toHaveLength(1);
    expect(set.layers[0]!.listNo).toHaveLength(1);
  });
});

describe('AutoMapper.apply (1x1 single-cell rule)', () => {
  it('paints the rule output wherever the input matches', () => {
    const { map, ts } = makeTargetMap();
    // Place a `floor` tile (id 0) at (2, 3) to trigger the rule.
    const floor = map.findLayer('floor') as TileLayer;
    floor.setCell(2, 3, new Cell(ts, 0));

    const { rulesMap, inputFloor, outputWalls } = makeOneRuleMap(ts);
    inputFloor.setCell(0, 0, new Cell(ts, 0));
    outputWalls.setCell(0, 0, new Cell(ts, 5));

    const mapper = AutoMapper.fromRulesMap(rulesMap);
    expect(mapper.errors()).toEqual([]);

    const result = mapper.apply(map, 'walls');
    expect(result.region.cellCount()).toBe(1);
    expect(result.region.contains({ x: 2, y: 3 })).toBe(true);
    expect(result.stamp.cellAt(2, 3).tileId).toBe(5);
    expect(result.stamp.cellAt(2, 3).tileset).toBe(ts);
  });
});

describe('AutoMapper.apply (inputnot rejects matches)', () => {
  it('skips matches where an inputnot cell is also present', () => {
    const { map, ts } = makeTargetMap();
    const floor = map.findLayer('floor') as TileLayer;
    const walls = map.findLayer('walls') as TileLayer;
    // Two candidates: (1,1) is "lone floor", (3,3) also has a wall.
    floor.setCell(1, 1, new Cell(ts, 0));
    floor.setCell(3, 3, new Cell(ts, 0));
    walls.setCell(3, 3, new Cell(ts, 7));

    // Rule: trigger when floor==0 AND there is NO wall at the same position.
    const rulesMap = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    rulesMap.addTileset(ts);
    const inputFloor = new TileLayer('input_floor', 0, 0, 1, 1);
    const inputNotWalls = new TileLayer('inputnot_walls', 0, 0, 1, 1);
    const outputWalls = new TileLayer('output_walls', 0, 0, 1, 1);
    inputFloor.setCell(0, 0, new Cell(ts, 0));
    inputNotWalls.setCell(0, 0, new Cell(ts, 7));
    outputWalls.setCell(0, 0, new Cell(ts, 5));
    rulesMap.addLayer(inputFloor);
    rulesMap.addLayer(inputNotWalls);
    rulesMap.addLayer(outputWalls);

    const mapper = AutoMapper.fromRulesMap(rulesMap);
    const result = mapper.apply(map, 'walls');

    expect(result.region.contains({ x: 1, y: 1 })).toBe(true);
    expect(result.region.contains({ x: 3, y: 3 })).toBe(false);
    expect(result.stamp.cellAt(1, 1).tileId).toBe(5);
  });
});

describe('AutoMapper.apply (multi-cell pattern)', () => {
  it('detects a 3x3 wall + interior floor pattern', () => {
    const { map, ts } = makeTargetMap(8, 8);
    const floor = map.findLayer('floor') as TileLayer;
    const walls = map.findLayer('walls') as TileLayer;

    // Set up a room: walls forming a 3x3 ring around (4,4) interior cell.
    // Walls at (3..5, 3) and (3..5, 5) and (3, 4) and (5, 4). Floor at (4, 4).
    for (let x = 3; x <= 5; x++) {
      walls.setCell(x, 3, new Cell(ts, 1));
      walls.setCell(x, 5, new Cell(ts, 1));
    }
    walls.setCell(3, 4, new Cell(ts, 1));
    walls.setCell(5, 4, new Cell(ts, 1));
    floor.setCell(4, 4, new Cell(ts, 0));

    // Rule: 3x3 pattern – walls (tile id 1) all around an interior floor
    // (tile id 0), emit "carpet" (tile id 2) onto `output_decor` at the
    // centre cell.
    const rulesMap = new TiledMap({ width: 3, height: 3, tileWidth: 16, tileHeight: 16 });
    rulesMap.addTileset(ts);
    const inputWalls = new TileLayer('input_walls', 0, 0, 3, 3);
    const inputFloor = new TileLayer('input_floor', 0, 0, 3, 3);
    const outputDecor = new TileLayer('output_decor', 0, 0, 3, 3);

    for (let x = 0; x < 3; x++) {
      inputWalls.setCell(x, 0, new Cell(ts, 1));
      inputWalls.setCell(x, 2, new Cell(ts, 1));
    }
    inputWalls.setCell(0, 1, new Cell(ts, 1));
    inputWalls.setCell(2, 1, new Cell(ts, 1));
    inputFloor.setCell(1, 1, new Cell(ts, 0));
    outputDecor.setCell(1, 1, new Cell(ts, 2));

    rulesMap.addLayer(inputWalls);
    rulesMap.addLayer(inputFloor);
    rulesMap.addLayer(outputDecor);

    // The target map needs a `decor` layer for the output to land in.
    map.addLayer(new TileLayer('decor', 0, 0, map.width, map.height));

    const mapper = AutoMapper.fromRulesMap(rulesMap);
    expect(mapper.errors()).toEqual([]);

    const result = mapper.apply(map, 'decor');
    expect(result.region.cellCount()).toBe(1);
    expect(result.region.contains({ x: 4, y: 4 })).toBe(true);
    expect(result.stamp.cellAt(4, 4).tileId).toBe(2);
  });
});

describe('AutoMapper.apply (multi-variation weighted output)', () => {
  it('picks deterministically given a seeded RNG', () => {
    const { map, ts } = makeTargetMap(4, 1);
    const floor = map.findLayer('floor') as TileLayer;
    // 4 separate match positions on a single row.
    for (let x = 0; x < 4; x++) floor.setCell(x, 0, new Cell(ts, 0));

    // Rules map with two output sets – one heavily weighted toward tile 6,
    // one rare variation that emits tile 7.
    const rulesMap = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    rulesMap.addTileset(ts);
    const inputFloor = new TileLayer('input_floor', 0, 0, 1, 1);
    inputFloor.setCell(0, 0, new Cell(ts, 0));

    // Two named output sets, both targeting `walls`.
    const out1 = new TileLayer('output1_walls', 0, 0, 1, 1);
    out1.setCell(0, 0, new Cell(ts, 6));
    out1.setProperty('Probability', { kind: 'float', value: 0.75 });

    const out2 = new TileLayer('output2_walls', 0, 0, 1, 1);
    out2.setCell(0, 0, new Cell(ts, 7));
    out2.setProperty('Probability', { kind: 'float', value: 0.25 });

    rulesMap.addLayer(inputFloor);
    rulesMap.addLayer(out1);
    rulesMap.addLayer(out2);

    const mapper = AutoMapper.fromRulesMap(rulesMap);
    expect(mapper.errors()).toEqual([]);

    // Deterministic stream of "random" draws: 0.1, 0.1, 0.9, 0.1 — these get
    // multiplied by the total weight (0.75 + 0.25 = 1.0); when the value is
    // below 0.75 we pick out1 (tile 6), otherwise out2 (tile 7).
    const draws = [0.1, 0.1, 0.9, 0.1];
    let i = 0;
    const rng = () => draws[i++]!;

    const result = mapper.apply(map, 'walls', undefined, { rng });
    // The matching loop walks (x, y) in raster order, so the picks line up
    // 1:1 with the draws above.
    expect(result.stamp.cellAt(0, 0).tileId).toBe(6);
    expect(result.stamp.cellAt(1, 0).tileId).toBe(6);
    expect(result.stamp.cellAt(2, 0).tileId).toBe(7);
    expect(result.stamp.cellAt(3, 0).tileId).toBe(6);
  });
});

describe('AutoMapper end-to-end via PaintTileLayer', () => {
  it('feeds the result into PaintTileLayer so undo restores', () => {
    const { map, ts } = makeTargetMap();
    const floor = map.findLayer('floor') as TileLayer;
    const walls = map.findLayer('walls') as TileLayer;
    floor.setCell(1, 1, new Cell(ts, 0));

    const { rulesMap, inputFloor, outputWalls } = makeOneRuleMap(ts);
    inputFloor.setCell(0, 0, new Cell(ts, 0));
    outputWalls.setCell(0, 0, new Cell(ts, 3));

    const mapper = AutoMapper.fromRulesMap(rulesMap);
    const result = mapper.apply(map, 'walls');
    expect(result.region.contains({ x: 1, y: 1 })).toBe(true);

    const doc = new MapDocument(map);
    const stack = new UndoStack();

    // Before: walls is empty.
    expect(walls.cellAt(1, 1).isEmpty()).toBe(true);

    // Stamp the result.
    const cmd = new PaintTileLayer(doc);
    cmd.paint(walls, 0, 0, result.stamp, result.region);
    stack.push(cmd);
    expect(walls.cellAt(1, 1).tileId).toBe(3);

    // Undo: walls is empty again.
    stack.undo();
    expect(walls.cellAt(1, 1).isEmpty()).toBe(true);

    // Redo: walls back to tile id 3.
    stack.redo();
    expect(walls.cellAt(1, 1).tileId).toBe(3);
  });
});

describe('AutoMappingManager', () => {
  it('applies a sequence of mappers and returns one result per (mapper, layer)', () => {
    const { map, ts } = makeTargetMap();
    const floor = map.findLayer('floor') as TileLayer;
    floor.setCell(0, 0, new Cell(ts, 0));

    // First mapper – emits to `walls`.
    const a = makeOneRuleMap(ts);
    a.inputFloor.setCell(0, 0, new Cell(ts, 0));
    a.outputWalls.setCell(0, 0, new Cell(ts, 1));

    // Second mapper – emits to a brand-new `decor` layer.
    const decorRules = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    decorRules.addTileset(ts);
    const inFloor = new TileLayer('input_floor', 0, 0, 1, 1);
    const outDecor = new TileLayer('output_decor', 0, 0, 1, 1);
    inFloor.setCell(0, 0, new Cell(ts, 0));
    outDecor.setCell(0, 0, new Cell(ts, 2));
    decorRules.addLayer(inFloor);
    decorRules.addLayer(outDecor);

    map.addLayer(new TileLayer('decor', 0, 0, map.width, map.height));

    const mgr = new AutoMappingManager()
      .addFor(AutoMapper.fromRulesMap(a.rulesMap), 'walls')
      .addFor(AutoMapper.fromRulesMap(decorRules), 'decor');

    expect(mgr.size()).toBe(2);
    expect(mgr.errors()).toEqual([]);

    const results = mgr.apply(map);
    expect(results).toHaveLength(2);
    expect(results[0]!.targetLayerName).toBe('walls');
    expect(results[0]!.stamp.cellAt(0, 0).tileId).toBe(1);
    expect(results[1]!.targetLayerName).toBe('decor');
    expect(results[1]!.stamp.cellAt(0, 0).tileId).toBe(2);
  });
});

describe('AutoMapper.apply with restricted region', () => {
  it('only matches positions intersecting the given region', () => {
    const { map, ts } = makeTargetMap();
    const floor = map.findLayer('floor') as TileLayer;
    // Floor cells across two different parts of the map.
    floor.setCell(0, 0, new Cell(ts, 0));
    floor.setCell(5, 5, new Cell(ts, 0));

    const { rulesMap, inputFloor, outputWalls } = makeOneRuleMap(ts);
    inputFloor.setCell(0, 0, new Cell(ts, 0));
    outputWalls.setCell(0, 0, new Cell(ts, 9));

    const mapper = AutoMapper.fromRulesMap(rulesMap);

    // Only allow matches in the top-left 3x3.
    const region = TileRegion.fromRect({ x: 0, y: 0, width: 3, height: 3 });
    const result = mapper.apply(map, 'walls', region);

    expect(result.region.contains({ x: 0, y: 0 })).toBe(true);
    expect(result.region.contains({ x: 5, y: 5 })).toBe(false);
    expect(result.region.cellCount()).toBe(1);
  });
});
