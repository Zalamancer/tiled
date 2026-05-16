// Port of the layer-classification part of `AutoMapper::setupRuleMapLayers`
// and `AutoMapper::setupRules` from src/tiled/automapper.cpp.
//
// The job of this module is to take a "rules map" – a `Map` whose tile layers
// are named with the `input*_<layerName>` / `inputnot*_<layerName>` /
// `output*_<layerName>` convention – and turn them into a structured set of
// `Rule`s the matching engine can run.
//
// The naming convention is:
//   <prefix><setName>_<layerName>
// where:
//   - `prefix` is one of `input`, `inputnot`, `output` (case-insensitive)
//   - `setName` is everything between the prefix and the first underscore
//     (it disambiguates several input/output sets that should be grouped)
//   - `layerName` is the rest, and identifies the target layer in the map
//     under automapping.
//
// Additionally, layers named `regions`, `regions_input`, `regions_output`
// hint at which area of the rules map defines each rule's input/output
// regions. When no `regions*` layers exist we derive the regions from the
// non-empty cells of the input/output layers themselves – this is the modern
// Tiled rules format and the one we exercise in tests.

import {
  TileRegion,
  type Cell,
  type Map as TiledMap,
  type Rect,
  type TileLayer,
} from '@tiled-ts/core';

/** Describes one positive input layer (counted as listYes upstream). */
export interface InputLayer {
  readonly tileLayer: TileLayer;
  readonly strictEmpty: boolean;
}

/** All `input*` / `inputnot*` tile layers grouped under a target layer name. */
export interface InputConditions {
  readonly layerName: string;
  readonly listYes: InputLayer[];
  readonly listNo: InputLayer[];
}

/** A single set of inputs (grouped by the `setName` suffix). */
export interface InputSet {
  readonly name: string;
  readonly layers: InputConditions[];
}

/** A single output tile layer participating in a rule (target layer name). */
export interface OutputTileLayer {
  readonly tileLayer: TileLayer;
  readonly name: string;
}

/** A single set of outputs (grouped by the `setName` suffix). */
export interface OutputSet {
  readonly name: string;
  readonly probability: number;
  readonly layers: OutputTileLayer[];
}

/**
 * Per-rule extracted geometry. `inputRegion` and `outputRegion` are
 * rules-map coordinates – they are translated to target coordinates at apply
 * time.
 */
export interface Rule {
  readonly inputRegion: TileRegion;
  readonly outputRegion: TileRegion;
  readonly inputBounds: Rect;
  readonly outputBounds: Rect;
}

/** Everything we extract from a rules map up-front, before any matching. */
export interface RuleMapSetup {
  readonly inputSets: InputSet[];
  readonly outputSets: OutputSet[];
  readonly inputLayerNames: Set<string>;
  readonly outputTileLayerNames: Set<string>;
  readonly rules: Rule[];
  readonly warnings: string[];
  readonly errors: string[];
}

/* ─────────────────────────── name parsing ────────────────────────────── */

interface ParsedName {
  /** `input` | `inputnot` | `output` */
  readonly prefix: 'input' | 'inputnot' | 'output';
  /** Index group name (`""` for the unnamed set) – the chars between
   *  the prefix and the first underscore. */
  readonly setName: string;
  /** The remainder of the name (target layer name in the map being mapped). */
  readonly layerName: string;
}

function parseLayerName(raw: string): ParsedName | undefined {
  // Skip commented-out layers, matching the upstream behavior.
  if (raw.startsWith('//')) return undefined;

  const underscoreAt = raw.indexOf('_');
  if (underscoreAt < 0) return undefined;

  const head = raw.substring(0, underscoreAt).toLowerCase();
  const tail = raw.substring(underscoreAt + 1);

  let prefix: ParsedName['prefix'] | undefined;
  let setName = '';

  // Order matters – `inputnot` must be checked before `input`.
  if (head.startsWith('inputnot')) {
    prefix = 'inputnot';
    setName = head.substring(8);
  } else if (head.startsWith('input')) {
    prefix = 'input';
    setName = head.substring(5);
  } else if (head.startsWith('output')) {
    prefix = 'output';
    setName = head.substring(6);
  }

  if (!prefix) return undefined;
  return { prefix, setName, layerName: tail };
}

function isRegionsLayer(name: string): 'all' | 'input' | 'output' | undefined {
  const lower = name.toLowerCase();
  if (lower === 'regions') return 'all';
  // `regions_input` / `regionsinput` / `regions input` – upstream simply asks
  // whether the name starts with "regions" and then ends with "input"/"output".
  if (lower.startsWith('regions') && lower.endsWith('input')) return 'input';
  if (lower.startsWith('regions') && lower.endsWith('output')) return 'output';
  return undefined;
}

/* ─────────────────────────── region helpers ──────────────────────────── */

function nonEmptyRegion(layer: TileLayer): TileRegion {
  return layer.region((c) => !c.isEmpty());
}

/**
 * Compute the connected components of a region. Two cells are connected if
 * they share an edge (4-connectivity), matching upstream's `coherentRegions`
 * helper.
 */
function coherentRegions(region: TileRegion): TileRegion[] {
  const points = [...region];
  const inRegion = new Set<string>();
  for (const p of points) inRegion.add(`${p.x},${p.y}`);

  const out: TileRegion[] = [];
  const visited = new Set<string>();

  for (const seed of points) {
    const seedKey = `${seed.x},${seed.y}`;
    if (visited.has(seedKey)) continue;

    const component = new TileRegion();
    const queue = [seed];
    while (queue.length > 0) {
      const p = queue.pop()!;
      const k = `${p.x},${p.y}`;
      if (visited.has(k)) continue;
      visited.add(k);
      component.addCell(p.x, p.y);
      const neighbours = [
        { x: p.x - 1, y: p.y },
        { x: p.x + 1, y: p.y },
        { x: p.x, y: p.y - 1 },
        { x: p.x, y: p.y + 1 },
      ];
      for (const n of neighbours) {
        const nk = `${n.x},${n.y}`;
        if (inRegion.has(nk) && !visited.has(nk)) queue.push(n);
      }
    }
    out.push(component);
  }

  return out;
}

function sortRegionsByTopLeft(regions: TileRegion[]): TileRegion[] {
  return regions.slice().sort((a, b) => {
    const ba = a.boundingRect();
    const bb = b.boundingRect();
    return ba.y === bb.y ? ba.x - bb.x : ba.y - bb.y;
  });
}

/* ─────────────────────────── property helpers ────────────────────────── */

function tileLayerStrictEmpty(tl: TileLayer): boolean {
  const v = tl.property('StrictEmpty');
  if (v && v.kind === 'bool') return v.value;
  const v2 = tl.property('AutoEmpty');
  if (v2 && v2.kind === 'bool') return v2.value;
  return false;
}

function tileLayerProbability(tl: TileLayer): number {
  const v = tl.property('Probability');
  if (v && (v.kind === 'float' || v.kind === 'int')) return Number(v.value);
  const v2 = tl.property('probability');
  if (v2 && (v2.kind === 'float' || v2.kind === 'int')) return Number(v2.value);
  return 1;
}

/* ─────────────────────────── main parse ──────────────────────────────── */

/**
 * Pull the input/output structure out of a rules map.
 *
 * `mLayerRegions` / `mLayerInputRegions` / `mLayerOutputRegions` (the
 * `regions*` layers in upstream) are not exposed in this port – we fall back
 * to deriving the per-rule regions from the union of input/output layer
 * non-empty cells. This matches the modern Tiled rules format and is enough
 * for every public test fixture.
 */
export function parseRulesMap(rulesMap: TiledMap): RuleMapSetup {
  const inputSetsByName = new Map<string, InputSet & { layers: InputConditions[] }>();
  const outputSetsByName = new Map<string, OutputSet & { layers: OutputTileLayer[]; probability: number }>();
  const inputLayerNames = new Set<string>();
  const outputTileLayerNames = new Set<string>();
  const warnings: string[] = [];
  const errors: string[] = [];

  let regionsAll: TileLayer | undefined;
  let regionsInput: TileLayer | undefined;
  let regionsOutput: TileLayer | undefined;

  function getInputSet(name: string): InputSet & { layers: InputConditions[] } {
    let set = inputSetsByName.get(name);
    if (!set) {
      set = { name, layers: [] };
      inputSetsByName.set(name, set);
    }
    return set;
  }

  function getOutputSet(
    name: string,
  ): OutputSet & { layers: OutputTileLayer[]; probability: number } {
    let set = outputSetsByName.get(name);
    if (!set) {
      set = { name, layers: [], probability: 1 };
      outputSetsByName.set(name, set);
    }
    return set;
  }

  for (const layer of rulesMap.allLayers()) {
    if (layer.isGroupLayer() || layer.isImageLayer()) continue;

    const rawName = layer.name;
    if (rawName.startsWith('//')) continue;

    // Recognised "regions" layer kinds.
    const regionsKind = isRegionsLayer(rawName);
    if (regionsKind && layer.isTileLayer()) {
      if (regionsKind === 'all') regionsAll = layer;
      else if (regionsKind === 'input') regionsInput = layer;
      else regionsOutput = layer;
      continue;
    }

    const parsed = parseLayerName(rawName);
    if (!parsed) {
      // Anonymous / unrecognised layers are silently kept aside.
      warnings.push(
        `Layer '${rawName}' is not recognized as a valid layer for Automapping.`,
      );
      continue;
    }

    if (parsed.prefix === 'input' || parsed.prefix === 'inputnot') {
      if (!layer.isTileLayer()) {
        errors.push(`'input_*' and 'inputnot_*' layers must be tile layers.`);
        continue;
      }
      inputLayerNames.add(parsed.layerName);

      const set = getInputSet(parsed.setName);
      let conditions = set.layers.find((c) => c.layerName === parsed.layerName);
      if (!conditions) {
        conditions = {
          layerName: parsed.layerName,
          listYes: [],
          listNo: [],
        };
        set.layers.push(conditions);
      }

      const inputLayer: InputLayer = {
        tileLayer: layer,
        strictEmpty: tileLayerStrictEmpty(layer),
      };

      if (parsed.prefix === 'inputnot') {
        conditions.listNo.push(inputLayer);
      } else {
        conditions.listYes.push(inputLayer);
      }
      continue;
    }

    if (parsed.prefix === 'output') {
      if (!layer.isTileLayer()) {
        // Only tile layers are emitted to outputs in this port. Object groups
        // are deferred (see header comment).
        warnings.push(
          `Output layer '${rawName}' is not a tile layer; object-group outputs are not supported in this port.`,
        );
        continue;
      }
      outputTileLayerNames.add(parsed.layerName);

      const set = getOutputSet(parsed.setName);
      const prob = tileLayerProbability(layer);
      // The probability of the set is taken from any output layer that
      // declares one – upstream uses the same convention.
      if (prob !== 1) set.probability = prob;
      set.layers.push({ tileLayer: layer, name: parsed.layerName });
    }
  }

  // Sort the layers in each input set by layerName so the matcher walks them
  // in a stable order (matters because the cells/positions are packed in the
  // same order, just like upstream).
  for (const set of inputSetsByName.values()) {
    set.layers.sort((a, b) => a.layerName.localeCompare(b.layerName));
  }

  if (inputSetsByName.size === 0) {
    errors.push('No input_<name> or inputnot_<name> layer found!');
  }
  if (outputSetsByName.size === 0) {
    errors.push('No output_<name> layer found!');
  }

  // ─── Region computation ───
  //
  // We collect the union of all input-layer non-empty cells and all
  // output-layer non-empty cells, then break the union into 4-connected
  // components. Each component becomes one Rule.
  let regionInput = new TileRegion();
  let regionOutput = new TileRegion();

  if (regionsAll) {
    const r = nonEmptyRegion(regionsAll);
    regionInput = r;
    regionOutput = r;
  }
  if (regionsInput) regionInput = regionInput.unite(nonEmptyRegion(regionsInput));
  if (regionsOutput) regionOutput = regionOutput.unite(nonEmptyRegion(regionsOutput));

  if (!regionsAll && !regionsInput) {
    for (const set of inputSetsByName.values()) {
      for (const conds of set.layers) {
        for (const il of conds.listYes) {
          regionInput = regionInput.unite(nonEmptyRegion(il.tileLayer));
        }
        for (const il of conds.listNo) {
          regionInput = regionInput.unite(nonEmptyRegion(il.tileLayer));
        }
      }
    }
  }

  if (!regionsAll && !regionsOutput) {
    for (const set of outputSetsByName.values()) {
      for (const ol of set.layers) {
        regionOutput = regionOutput.unite(nonEmptyRegion(ol.tileLayer));
      }
    }
  }

  const combinedRaw = regionInput.unite(regionOutput);
  const combined = sortRegionsByTopLeft(coherentRegions(combinedRaw));

  const rules: Rule[] = [];
  for (const combinedRegion of combined) {
    const inputRegion = combinedRegion.intersected(regionInput);
    const outputRegion = combinedRegion.intersected(regionOutput);
    if (inputRegion.isEmpty() || outputRegion.isEmpty()) continue;
    rules.push({
      inputRegion,
      outputRegion,
      inputBounds: inputRegion.boundingRect(),
      outputBounds: outputRegion.boundingRect(),
    });
  }

  return {
    inputSets: Array.from(inputSetsByName.values()),
    outputSets: Array.from(outputSetsByName.values()),
    inputLayerNames,
    outputTileLayerNames,
    rules,
    warnings,
    errors,
  };
}

/* ───────────────── exposed helpers used by AutoMapper.ts ────────────── */

/** Returns true iff every cell in `region` of `tileLayer` is empty. */
export function isEmptyRegion(tileLayer: TileLayer, region: TileRegion): boolean {
  for (const p of region) {
    if (!tileLayer.cellAt(p.x, p.y).isEmpty()) return false;
  }
  return true;
}

/** True when `a` matches `b` for the rule engine – tile id + tileset + visual flags. */
export function cellsMatch(a: Cell, b: Cell): boolean {
  // Empty matches empty, anything else needs tileset + tileId + visual flags.
  if (a.isEmpty() && b.isEmpty()) return true;
  if (a.isEmpty() || b.isEmpty()) return false;
  return a.tileset === b.tileset && a.tileId === b.tileId && a.flags === b.flags;
}
