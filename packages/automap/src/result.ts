// The data returned by `AutoMapper.apply` and `AutoMappingManager.apply`.
//
// `AutoMapResult` describes a single set of cells the engine wants to drop
// onto the target map. It is intentionally *not* a command — callers feed it
// into `PaintTileLayer` (or just `TileLayer.setCells` for inspection) so that
// the editor's undo system stays the single source of truth.

import type { TileLayer, TileRegion } from '@tiled-ts/core';

/** The payload produced by running an AutoMapper against a target map. */
export interface AutoMapResult {
  /** The name of the layer the changes are intended for. */
  readonly targetLayerName: string;
  /**
   * A loose tile layer holding the new cells in *target-local* coordinates.
   * Empty cells in the stamp leave the target untouched (caller should respect
   * that by walking `region` and using `stamp.cellAt`).
   */
  readonly stamp: TileLayer;
  /**
   * The set of target-local positions that were actually touched. Suitable to
   * hand to `PaintTileLayer.paint(target, 0, 0, stamp, region)`.
   */
  readonly region: TileRegion;
}
