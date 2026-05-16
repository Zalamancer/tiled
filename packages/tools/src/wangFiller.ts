// Simplified port of src/tiled/wangfiller.{h,cpp}.
//
// Given a `WangSet` and a small "desired Wang IDs" grid (one per cell), pick
// the best matching tile per cell and produce a stamp layer. This is the
// algorithmic core of WangBrush / WangFill in BucketFillTool.
//
// We diverge from upstream in *complexity*, not in correctness for the common
// case — no rotational symmetry, no hexagonal-renderer adjacency, no preview
// "correction" pass. Those refinements can be added later without breaking
// callers, because all of them are pure-function-shaped.

import {
  Cell,
  type Tile,
  TileLayer,
  WangId,
  WangIndex,
  WangIdMask,
  type WangSet,
} from '@tiled-ts/core';

import { RandomPicker } from './randomPicker.js';

export interface WangFillerOptions {
  /** Source of fresh tiles. Required. */
  wangSet: WangSet;
  /** Map's tile layer the filler will paint into (read-only). */
  baseLayer: TileLayer;
  rng?: () => number;
}

interface CellInfo {
  /** WangId we want this cell to have (per-index colour values, 0 = wildcard). */
  desired: WangId;
  /** Bits that *must* match. Unset bits are free for the filler to pick. */
  mask: WangId;
}

export class WangFiller {
  private opts: WangFillerOptions;
  private grid = new Map<number, CellInfo>();
  private picker = new RandomPicker<Tile>();

  constructor(opts: WangFillerOptions) {
    this.opts = opts;
  }

  /** Returns the entry for `(x, y)`, creating an empty one if needed. */
  cellInfoAt(x: number, y: number): CellInfo {
    const k = this.key(x, y);
    let info = this.grid.get(k);
    if (!info) {
      info = { desired: new WangId(), mask: new WangId() };
      this.grid.set(k, info);
    }
    return info;
  }

  /** Sets one index colour for the given cell. */
  setIndex(x: number, y: number, index: WangIndex, color: number): void {
    const info = this.cellInfoAt(x, y);
    info.desired.setIndexColor(index, color);
    // Mark this index as constrained.
    info.mask.setIndexColor(index, 0xff);
  }

  /**
   * For every cell with constraints, pick the best matching tile and write
   * it into `output`. Cells that have no good match are written as empty.
   */
  apply(output: TileLayer): void {
    for (const [k, info] of this.grid) {
      const { x, y } = this.unkey(k);

      // Combine with the existing wangId on the live map so we don't break
      // adjacent constraints. The existing tile becomes the "context".
      const live = this.opts.baseLayer.cellAt(x, y);
      let baseId = live.isEmpty()
        ? new WangId()
        : this.opts.wangSet.wangIdOfCell(live);

      // Mix: where mask is set, take from `desired`; elsewhere, keep base.
      const target = new WangId(baseId.toBigInt());
      target.mergeWith(info.desired, info.mask);

      // After merging, every position of `target` is meaningful — match
      // against the full WangSet type mask so partial-match tiles are
      // ranked correctly.
      const fullMask = new WangId(this.opts.wangSet.typeMask().toBigInt());
      const tile = this.bestMatch(target, fullMask);
      if (!tile) continue;
      const c = new Cell(this.opts.wangSet.tileset, tile.id);

      // Output uses LOCAL coordinates within itself; the caller is expected
      // to resize/translate later.
      if (x < 0 || y < 0 || x >= output.width || y >= output.height) {
        // Grow the output to fit.
        const newW = Math.max(output.width, x + 1);
        const newH = Math.max(output.height, y + 1);
        output.resize({ width: newW, height: newH }, { x: 0, y: 0 });
      }
      output.setCell(x, y, c);
      // Mark as "checked" so callers can build the affected region.
      c.setChecked(true);
    }
  }

  /** Best matching tile under the given `desired` / `mask` pair. Ties broken
   *  by tile probability. */
  bestMatch(desired: WangId, mask: WangId): Tile | undefined {
    const wangSet = this.opts.wangSet;
    let best: { cost: number; tiles: { tile: Tile; weight: number }[] } | null = null;
    const tilesetTiles = wangSet.tileset.tilesById;
    const maskBig = mask.toBigInt();

    for (const [tileId, declaredId] of wangSet.wangIdByTileId()) {
      const tile = tilesetTiles.get(tileId);
      if (!tile) continue;
      const cost = this.matchCost(declaredId, desired, maskBig);
      if (cost < 0) continue;
      if (!best || cost < best.cost) {
        best = { cost, tiles: [{ tile, weight: tile.probability }] };
      } else if (cost === best.cost) {
        best.tiles.push({ tile, weight: tile.probability });
      }
    }

    if (!best) return undefined;
    const picker = new RandomPicker<Tile>();
    if (this.opts.rng) picker.rng = this.opts.rng;
    for (const { tile, weight } of best.tiles) picker.add(tile, weight);
    return picker.pick();
  }

  /** Returns 0 for an exact match; +∞ when impossible. Otherwise the count
   *  of mismatched index positions, weighted via `transitionPenalty`. */
  matchCost(declared: WangId, desired: WangId, maskBig: bigint): number {
    let cost = 0;
    for (let i = 0; i < WangId.NumIndexes; i++) {
      const shift = BigInt(i) * 8n;
      const m = Number((maskBig >> shift) & 0xffn);
      if (m === 0) continue; // unconstrained
      const want = desired.indexColor(i);
      const have = declared.indexColor(i);
      if (want === have) continue;
      const penalty = this.opts.wangSet.transitionPenalty(want, have);
      if (penalty < 0) return -1; // impossible
      cost += penalty + 1;
    }
    return cost;
  }

  /** Suppress the unused-import warning. */
  static readonly MaskAll = WangIdMask.Full;

  private key(x: number, y: number): number {
    return (y + 0x8000) * 0x10000 + (x + 0x8000);
  }
  private unkey(k: number): { x: number; y: number } {
    const y = Math.floor(k / 0x10000) - 0x8000;
    const x = (k & 0xffff) - 0x8000;
    return { x, y };
  }
}
