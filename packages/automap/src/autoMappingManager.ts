// Port of `Tiled::AutomappingManager` from src/tiled/automappingmanager.cpp.
//
// Upstream this class is a `QObject` that owns a list of `RuleMapReference`s
// loaded from a `rules.txt` file on disk, watches them for changes, and
// orchestrates an `AutoMapperWrapper` (which packages each `autoMap` call as
// an undo command). The bits that depend on the filesystem and on Qt signals
// are not included in this port – we keep just the orchestration:
//
//   - ordered list of `AutoMapper`s
//   - apply them in sequence
//   - collect per-rule-set results so callers can chain them through
//     `PaintTileLayer`.
//
// Deferred (the upstream features omitted here):
//   - `setMapDocument`, file watching, `errorsOccurred` / `warningsOccurred`
//     signals, `automappingWhileDrawing` session option.
//   - `RuleMapReference.mapNameFilter` for selecting rules by map name.
//   - The undo-command wiring (`AutoMapperWrapper`). Callers in this port
//     drive `PaintTileLayer` themselves via the `AutoMapResult` returned
//     from `apply`.

import type { Map as TiledMap, TileRegion } from '@tiled-ts/core';

import { AutoMapper, type ApplyOptions } from './autoMapper.js';
import type { AutoMapResult } from './result.js';

export interface AutoMappingManagerEntry {
  /** The auto-mapper compiled from one rules map. */
  readonly mapper: AutoMapper;
  /**
   * Which target layer this entry writes to. If omitted, the manager
   * dispatches to every output layer the mapper declares.
   */
  readonly targetLayerName?: string;
}

export class AutoMappingManager {
  private readonly entries: AutoMappingManagerEntry[] = [];

  /** Register an auto-mapper. Application order matches insertion order. */
  add(entry: AutoMappingManagerEntry): this {
    this.entries.push(entry);
    return this;
  }

  /** Convenience: append a mapper that targets a single layer by name. */
  addFor(mapper: AutoMapper, targetLayerName: string): this {
    this.entries.push({ mapper, targetLayerName });
    return this;
  }

  /** Number of registered auto-mappers. */
  size(): number {
    return this.entries.length;
  }

  /** All registered mappers, in order. */
  mappers(): ReadonlyArray<AutoMapper> {
    return this.entries.map((e) => e.mapper);
  }

  /** Aggregated set of all errors across the registered mappers. */
  errors(): string[] {
    return this.entries.flatMap((e) => e.mapper.errors());
  }

  /** Aggregated set of all warnings across the registered mappers. */
  warnings(): string[] {
    return this.entries.flatMap((e) => e.mapper.warnings());
  }

  /**
   * Apply every registered mapper to `target` in order, returning one
   * `AutoMapResult` per (mapper, output layer) pair that produced changes.
   *
   * The results are intended to be applied in order: each entry's changes are
   * visible to later mappers because they are pushed to the target layer via
   * `PaintTileLayer` (callers responsibility) before the next mapper runs.
   * The current implementation does *not* mutate `target` directly – callers
   * must apply each result with `PaintTileLayer` before the next call to
   * `apply` if they want intermediate state to influence later rules.
   */
  apply(target: TiledMap, region?: TileRegion, options?: ApplyOptions): AutoMapResult[] {
    const out: AutoMapResult[] = [];
    for (const entry of this.entries) {
      const targets = entry.targetLayerName
        ? [entry.targetLayerName]
        : entry.mapper.outputLayerNames();

      for (const targetName of targets) {
        const result = entry.mapper.apply(target, targetName, region, options);
        if (!result.region.isEmpty()) out.push(result);
      }
    }
    return out;
  }
}
