// Port of src/tiled/tilestamp.{h,cpp} (simplified).
//
// A stamp is a set of `Variation`s — each one a small tile layer plus a
// probability weight. Tools that use a stamp (`StampBrush`, `BucketFillTool`)
// pick one variation per click (random) or all at once (tile-fill).

import type { TileLayer } from '@tiled-ts/core';
import { RandomPicker } from './randomPicker.js';

export interface StampVariation {
  layer: TileLayer;
  probability: number;
}

export class TileStamp {
  variations: StampVariation[] = [];

  isEmpty(): boolean {
    return this.variations.length === 0 || this.variations.every((v) => v.layer.isEmpty());
  }

  addVariation(layer: TileLayer, probability = 1): void {
    this.variations.push({ layer, probability });
  }

  /** Picks one variation respecting weights. Returns `undefined` when empty. */
  randomVariation(rng?: () => number): StampVariation | undefined {
    if (this.variations.length === 0) return undefined;
    const picker = new RandomPicker<StampVariation>();
    if (rng) picker.rng = rng;
    for (const v of this.variations) picker.add(v, v.probability);
    return picker.isEmpty() ? undefined : picker.pick();
  }
}
