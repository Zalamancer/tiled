// Port of `Tiled::AutoMapper` from src/tiled/automapper.cpp.
//
// What this port faithfully implements:
//   - The "rules map" decomposition into `(input, inputnot, output)` triples
//     grouped by the `setName` suffix (see `rulesParser.ts`).
//   - The matching algorithm — scan the target layer with the input region
//     translated to every legal (x, y), and call a match when at least one
//     `InputSet`'s positions all satisfy the per-cell *yes* and *no* lists.
//   - Output copying: the cells from the rules-map output layer are stamped
//     into the result, translated to match where the input matched.
//   - Weighted multi-set output: when several output sets share an empty
//     `setName` we collect them into a `RandomPicker` and let `apply()` pick
//     one per match.
//
// Deferred features (not relevant to the small fixtures we test):
//   - Hexagonal neighbour adjacency / RotatedHexagonal120 cell flag matching.
//   - Object-group outputs (only tile-layer outputs are emitted).
//   - `MatchInOrder`, `rule_options` object layers, `DeleteTiles`,
//     `MatchOutsideMap`, `OverflowBorder`, `WrapBorder`.
//   - `MatchType` tile properties (Empty/NonEmpty/Other/Negate/Ignore). The
//     port treats every non-empty input cell as a literal "MatchType::Tile"
//     and every empty cell as "no constraint at this position" (cells are
//     simply not included in the `listYes` collection if empty unless an
//     input layer declares `StrictEmpty`).
//   - `IgnoreHorizontalFlip` / `IgnoreVerticalFlip` / `IgnoreDiagonalFlip`
//     per-input-layer flag masking (the flagsMask is always
//     `Cell::VisualFlags`).
//
// The matching ordering and the data structures are deliberately kept close
// to upstream so the rest can be added without rewriting the core.

import {
  Cell,
  TileLayer,
  TileRegion,
  type Map as TiledMap,
  type Point,
} from '@tiled-ts/core';

import { RandomPicker } from './randomPicker.js';
import type { AutoMapResult } from './result.js';
import {
  cellsMatch,
  isEmptyRegion,
  parseRulesMap,
  type InputSet,
  type OutputSet,
  type Rule,
  type RuleMapSetup,
} from './rulesParser.js';

/** Compact per-cell match condition packed for the matcher hot loop. */
interface CompiledInputCellCondition {
  /** Position relative to the input-region bounding-rect top-left. */
  readonly dx: number;
  readonly dy: number;
  /** Target layer name to look the cell up in. */
  readonly layerName: string;
  /** "Any of these" cells – the target cell at (dx, dy) must equal one. */
  readonly anyOf: ReadonlyArray<Cell>;
  /** "None of these" cells – the target cell at (dx, dy) must not equal any. */
  readonly noneOf: ReadonlyArray<Cell>;
}

/** A compiled input set is the per-position cell list packed in array form. */
interface CompiledInputSet {
  readonly positions: ReadonlyArray<CompiledInputCellCondition>;
}

/** A compiled output set – the rules-layer cells to stamp at each match. */
interface CompiledOutputTileLayer {
  readonly layerName: string;
  readonly cells: ReadonlyArray<{
    readonly dx: number;
    readonly dy: number;
    readonly cell: Cell;
  }>;
}
interface CompiledOutputSet {
  readonly probability: number;
  readonly tileOutputs: ReadonlyArray<CompiledOutputTileLayer>;
}

/** Each rule pre-compiled for fast matching against the target layer. */
interface CompiledRule {
  readonly inputSets: CompiledInputSet[];
  readonly outputSets: CompiledOutputSet[];
  /**
   * Width/height of the rule's input bounding rect minus one. We need this to
   * derive the search-region size during apply.
   */
  readonly inputWidth: number;
  readonly inputHeight: number;
  /** Translation between input-region top-left and output-region top-left. */
  readonly inputToOutputOffset: Point;
}

/** Options for an `AutoMapper.apply` invocation. */
export interface ApplyOptions {
  /** Injectable RNG for tests. Returns a value in `[0, 1)`. Defaults to `Math.random`. */
  rng?: () => number;
}

export class AutoMapper {
  readonly setup: RuleMapSetup;
  private readonly compiled: CompiledRule[];

  private constructor(setup: RuleMapSetup) {
    this.setup = setup;
    this.compiled = setup.rules.map((rule) =>
      compileRule(rule, setup.inputSets, setup.outputSets),
    );
  }

  /**
   * Parse a rules map into an `AutoMapper`. Errors that prevent matching
   * are returned via `errors()`; warnings are non-fatal.
   */
  static fromRulesMap(rulesMap: TiledMap): AutoMapper {
    const setup = parseRulesMap(rulesMap);
    return new AutoMapper(setup);
  }

  /** True iff the rules map referred to `layerName` as an input. */
  ruleLayerNameUsed(layerName: string): boolean {
    return this.setup.inputLayerNames.has(layerName);
  }

  /** Returns the (non-empty) names of every output tile-layer the rules emit. */
  outputLayerNames(): string[] {
    return Array.from(this.setup.outputTileLayerNames);
  }

  errors(): string[] {
    return this.setup.errors;
  }
  warnings(): string[] {
    return this.setup.warnings;
  }

  /**
   * Apply the rules of this AutoMapper to `target`, producing a single
   * `AutoMapResult` describing the changes to make to `targetLayerName`.
   *
   * When `region` is omitted the rules are tested across the full map.
   *
   * Matching reads from the target's tile layers by name. Each input layer
   * named `someName` in the rules map is looked up as `someName` on `target`.
   */
  apply(
    target: TiledMap,
    targetLayerName: string,
    region?: TileRegion,
    options?: ApplyOptions,
  ): AutoMapResult {
    const rng = options?.rng ?? Math.random;
    const stamp = new TileLayer(targetLayerName, 0, 0, target.width, target.height);
    const touched = new TileRegion();

    // The output layer in the target – may not exist yet (rules can create
    // brand-new layers in the upstream editor). For testing/inspection we
    // simply ignore writes if the target layer does not exist.
    const outputLayer = findTileLayerByName(target, targetLayerName);
    if (!outputLayer) {
      return { targetLayerName, stamp, region: touched };
    }

    // Build the search bounds.
    const searchBounds =
      region ??
      TileRegion.fromRect({ x: 0, y: 0, width: target.width, height: target.height });
    const sb = searchBounds.boundingRect();

    for (const rule of this.compiled) {
      // The rule is applied to every (x, y) such that the input region fits
      // entirely within the map. Inside the search bounds we walk every
      // candidate top-left.
      const minX = sb.x;
      const minY = sb.y;
      const maxX = sb.x + sb.width - 1 - rule.inputWidth;
      const maxY = sb.y + sb.height - 1 - rule.inputHeight;

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!ruleMatchesAt(target, rule, x, y)) continue;
          applyCompiledRule(rule, x, y, targetLayerName, stamp, touched, rng);
        }
      }
    }

    return { targetLayerName, stamp, region: touched };
  }
}

/* ─────────────────────── compile-step helpers ────────────────────────── */

function compileRule(
  rule: Rule,
  inputSets: ReadonlyArray<InputSet>,
  outputSets: ReadonlyArray<OutputSet>,
): CompiledRule {
  const ibb = rule.inputBounds;
  const obb = rule.outputBounds;

  const compiledInputSets: CompiledInputSet[] = [];

  for (const inputSet of inputSets) {
    const positions: CompiledInputCellCondition[] = [];

    for (const conditions of inputSet.layers) {
      // Walk the input region cell-by-cell and build per-position any/none
      // lists for this conditions group (one target layer name).
      for (const p of rule.inputRegion) {
        const dx = p.x - ibb.x;
        const dy = p.y - ibb.y;

        const anyOf: Cell[] = [];
        const noneOf: Cell[] = [];

        for (const il of conditions.listYes) {
          const cell = il.tileLayer.cellAt(p.x, p.y);
          if (!cell.isEmpty() || il.strictEmpty) {
            // A literal tile to match (Tile match type, the common case).
            // `strictEmpty` lets the user demand an empty cell explicitly.
            anyOf.push(cell);
          }
        }
        for (const il of conditions.listNo) {
          const cell = il.tileLayer.cellAt(p.x, p.y);
          if (!cell.isEmpty() || il.strictEmpty) {
            noneOf.push(cell);
          }
        }

        // If neither list has anything to say about this cell, the position
        // simply does not constrain the match.
        if (anyOf.length === 0 && noneOf.length === 0) continue;

        positions.push({
          dx,
          dy,
          layerName: conditions.layerName,
          anyOf,
          noneOf,
        });
      }
    }

    // Skip input sets that produced no positional constraints – they would
    // match anywhere and are clearly degenerate fixtures.
    if (positions.length > 0) compiledInputSets.push({ positions });
  }

  const compiledOutputSets: CompiledOutputSet[] = [];

  for (const outputSet of outputSets) {
    const tileOutputs: CompiledOutputTileLayer[] = [];

    for (const ol of outputSet.layers) {
      // Don't compile output layers that are completely empty across the
      // entire output region.
      if (isEmptyRegion(ol.tileLayer, rule.outputRegion)) continue;

      const cells: { dx: number; dy: number; cell: Cell }[] = [];
      for (const p of rule.outputRegion) {
        const cell = ol.tileLayer.cellAt(p.x, p.y);
        if (cell.isEmpty()) continue;
        cells.push({
          dx: p.x - obb.x,
          dy: p.y - obb.y,
          cell,
        });
      }
      if (cells.length > 0) tileOutputs.push({ layerName: ol.name, cells });
    }

    if (tileOutputs.length > 0) {
      compiledOutputSets.push({
        probability: outputSet.probability,
        tileOutputs,
      });
    }
  }

  return {
    inputSets: compiledInputSets,
    outputSets: compiledOutputSets,
    inputWidth: ibb.width - 1,
    inputHeight: ibb.height - 1,
    inputToOutputOffset: { x: obb.x - ibb.x, y: obb.y - ibb.y },
  };
}

/* ─────────────────────── match / apply helpers ───────────────────────── */

function ruleMatchesAt(
  target: TiledMap,
  rule: CompiledRule,
  x: number,
  y: number,
): boolean {
  if (rule.inputSets.length === 0) return false;
  for (const set of rule.inputSets) {
    if (inputSetMatches(target, set, x, y)) return true;
  }
  return false;
}

function inputSetMatches(
  target: TiledMap,
  set: CompiledInputSet,
  x: number,
  y: number,
): boolean {
  for (const cond of set.positions) {
    const layer = findTileLayerByName(target, cond.layerName);
    const cell = layer ? layer.cellAt(x + cond.dx, y + cond.dy) : EMPTY;

    if (cond.anyOf.length > 0) {
      let matched = false;
      for (const desired of cond.anyOf) {
        if (cellsMatch(desired, cell)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    for (const undesired of cond.noneOf) {
      if (cellsMatch(undesired, cell)) return false;
    }
  }
  return true;
}

function applyCompiledRule(
  rule: CompiledRule,
  matchX: number,
  matchY: number,
  targetLayerName: string,
  stamp: TileLayer,
  touched: TileRegion,
  rng: () => number,
): void {
  // Choose one output set by weighted probability.
  const chosen = pickOutputSet(rule.outputSets, rng);
  if (!chosen) return;

  for (const out of chosen.tileOutputs) {
    if (out.layerName !== targetLayerName) continue;

    for (const { dx, dy, cell } of out.cells) {
      const tx = matchX + rule.inputToOutputOffset.x + dx;
      const ty = matchY + rule.inputToOutputOffset.y + dy;
      stamp.setCell(tx, ty, cell);
      touched.addCell(tx, ty);
    }
  }
}

function pickOutputSet(
  sets: ReadonlyArray<CompiledOutputSet>,
  rng: () => number,
): CompiledOutputSet | undefined {
  if (sets.length === 0) return undefined;
  if (sets.length === 1) return sets[0]!;

  const picker = new RandomPicker<CompiledOutputSet>();
  picker.rng = rng;
  for (const s of sets) picker.add(s, s.probability);
  return picker.pick();
}

/* ─────────────────────── target-layer lookup ─────────────────────────── */

function findTileLayerByName(map: TiledMap, name: string): TileLayer | undefined {
  for (const l of map.tileLayers()) if (l.name === name) return l;
  return undefined;
}

// Singleton empty Cell shared across calls – avoids constructing one per
// missing-layer probe.
const EMPTY: Cell = new Cell();
