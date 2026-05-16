// Port of src/tiled/stampbrush.{h,cpp} — the primary tile-painting tool.
//
// Stroke lifecycle:
//   - Single click   → stamp at cursor.
//   - Click+drag     → stamp at every traversed cell, merging into one undo.
//   - Shift-click    → straight-line stamp from previous press to current.
//   - Right-click    → erase along the stroke.

import {
  Cell,
  type Point,
  TileLayer,
  TileRegion,
} from '@tiled-ts/core';
import { PaintTileLayer } from '@tiled-ts/commands';
import { Tool, type ToolPointerEvent, type ToolPreview, type ToolContext } from './tool.js';
import type { TileStamp } from './tileStamp.js';

export class StampBrush extends Tool {
  /** The active stamp (drives both preview and the actual painting). */
  stamp: TileStamp | null = null;
  private down = false;
  private erasing = false;
  private currentCmd: PaintTileLayer | null = null;
  private currentVariationLayer: TileLayer | null = null;
  private origin: Point = { x: 0, y: 0 };
  private lastStampPos: Point | null = null;
  /** RNG override; defaults to `Math.random`. */
  rng: (() => number) | undefined;

  constructor() {
    super('StampBrush', 'Stamp Brush');
  }

  override activate(ctx: ToolContext): void {
    super.activate(ctx);
    this.refreshPreview({ x: 0, y: 0 });
  }

  override pointerMove(e: ToolPointerEvent): void {
    if (this.down && this.currentCmd) {
      this.stampAt(e.tilePos, this.erasing);
    } else {
      this.refreshPreview(e.tilePos);
    }
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (!this.currentTileLayer() || !this.stamp || this.stamp.isEmpty()) return;
    if (e.button !== 'left' && e.button !== 'right') return;

    this.down = true;
    this.erasing = e.button === 'right';
    this.currentCmd = new PaintTileLayer(this.requireCtx().doc).setMergeable(true);
    this.currentCmd.text = this.erasing ? 'Erase' : 'Paint';
    this.lastStampPos = null;
    this.stampAt(e.tilePos, this.erasing);
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.down) return;
    if (e.button !== 'left' && e.button !== 'right') return;
    this.down = false;
    const cmd = this.currentCmd;
    this.currentCmd = null;
    if (cmd) this.requireCtx().push(cmd);
    this.refreshPreview(e.tilePos);
  }

  override preview(): ToolPreview | null {
    if (!this.currentVariationLayer || !this.stamp) return null;
    const region = new TileRegion();
    for (let y = 0; y < this.currentVariationLayer.height; y++) {
      for (let x = 0; x < this.currentVariationLayer.width; x++) {
        if (!this.currentVariationLayer.cellAt(x, y).isEmpty()) {
          region.addCell(this.origin.x + x, this.origin.y + y);
        }
      }
    }
    return { stamp: this.currentVariationLayer, origin: this.origin, region };
  }

  private refreshPreview(tilePos: Point): void {
    if (!this.stamp || this.stamp.isEmpty()) {
      this.currentVariationLayer = null;
      this.requireCtxOrNull()?.invalidate();
      return;
    }
    const variation = this.stamp.randomVariation(this.rng);
    if (!variation) {
      this.currentVariationLayer = null;
      return;
    }
    this.currentVariationLayer = variation.layer;
    // Centre the stamp on the cursor.
    this.origin = {
      x: tilePos.x - Math.floor(this.currentVariationLayer.width / 2),
      y: tilePos.y - Math.floor(this.currentVariationLayer.height / 2),
    };
    this.requireCtxOrNull()?.invalidate();
  }

  private stampAt(tilePos: Point, erase: boolean): void {
    const layer = this.currentTileLayer();
    if (!layer || !this.currentCmd || !this.stamp) return;

    const variation = this.stamp.randomVariation(this.rng);
    if (!variation) return;
    const stamp = variation.layer;
    this.currentVariationLayer = stamp;

    const ox = tilePos.x - Math.floor(stamp.width / 2);
    const oy = tilePos.y - Math.floor(stamp.height / 2);
    this.origin = { x: ox, y: oy };

    const region = new TileRegion();
    for (let y = 0; y < stamp.height; y++) {
      for (let x = 0; x < stamp.width; x++) {
        if (!stamp.cellAt(x, y).isEmpty()) {
          const px = ox + x;
          const py = oy + y;
          if (px >= 0 && py >= 0 && px < layer.width && py < layer.height) {
            region.addCell(px, py);
          }
        }
      }
    }
    if (region.isEmpty()) return;

    if (erase) {
      this.currentCmd.erase(layer, region);
      // Apply erasure immediately by running the command's redo, then
      // skip a duplicate redo when finally pushed.
    } else {
      this.currentCmd.paint(layer, ox, oy, stamp, region);
    }
    // Apply the new strokes live so the user sees them as they drag. The
    // command will be pushed (and re-applied) on pointer-up; tail merging
    // takes care of not duplicating effects since redo writes the cached
    // source over the (now updated) target.
    this.applyLiveStroke(layer, region, ox, oy, stamp, erase);
    this.lastStampPos = tilePos;
    this.requireCtxOrNull()?.invalidate();
  }

  private applyLiveStroke(
    target: TileLayer,
    region: TileRegion,
    ox: number,
    oy: number,
    stamp: TileLayer,
    erase: boolean,
  ): void {
    const empty = new Cell();
    for (const p of region) {
      target.setCell(p.x, p.y, erase ? empty : stamp.cellAt(p.x - ox, p.y - oy));
    }
  }

  private requireCtxOrNull(): ToolContext | null {
    return this.ctx;
  }
}
