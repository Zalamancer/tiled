// Port of src/tiled/bucketfilltool.{h,cpp}.
//
// Click to fill a 4-connected region of like-coloured cells with the active
// stamp. Holding Shift fills the current selection / whole layer. Right-click
// cancels an in-progress preview.

import { Cell, type Point, TileLayer, TileRegion } from '@tiled-ts/core';
import { PaintTileLayer } from '@tiled-ts/commands';
import { Tool, type ToolPointerEvent, type ToolPreview } from './tool.js';
import type { TileStamp } from './tileStamp.js';
import { floodFillRegion, matchAny } from './floodFill.js';

export type FillMethod = 'tile' | 'random' | 'wang';

export class BucketFillTool extends Tool {
  stamp: TileStamp | null = null;
  fillMethod: FillMethod = 'tile';
  rng: (() => number) | undefined;

  private fillRegion: TileRegion = new TileRegion();
  private previewStamp: TileLayer | null = null;
  private previewOrigin: Point = { x: 0, y: 0 };
  private lastTilePos: Point = { x: 0, y: 0 };
  private lastShift = false;

  constructor() {
    super('BucketFillTool', 'Bucket Fill');
  }

  override pointerMove(e: ToolPointerEvent): void {
    this.recomputeFill(e.tilePos, e.modifiers.shift);
    this.requireCtx().invalidate();
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    const layer = this.currentTileLayer();
    if (!layer || !this.stamp || this.stamp.isEmpty()) return;
    this.recomputeFill(e.tilePos, e.modifiers.shift);
    if (this.fillRegion.isEmpty()) return;

    const cmd = new PaintTileLayer(this.requireCtx().doc);
    cmd.text = e.modifiers.shift ? 'Fill Selection' : 'Fill Area';
    this.paintInto(cmd, layer);
    this.requireCtx().push(cmd);
  }

  override preview(): ToolPreview | null {
    if (!this.previewStamp || this.fillRegion.isEmpty()) return null;
    return { stamp: this.previewStamp, origin: this.previewOrigin, region: this.fillRegion };
  }

  /* ─── internals ─── */

  private recomputeFill(tilePos: Point, shift: boolean): void {
    const layer = this.currentTileLayer();
    if (!layer || !this.stamp) {
      this.fillRegion = new TileRegion();
      this.previewStamp = null;
      return;
    }
    if (
      tilePos.x === this.lastTilePos.x &&
      tilePos.y === this.lastTilePos.y &&
      shift === this.lastShift &&
      !this.fillRegion.isEmpty()
    ) {
      return;
    }
    this.lastTilePos = tilePos;
    this.lastShift = shift;

    if (shift) {
      // Whole-layer fill (selection support could be added when implemented).
      this.fillRegion = TileRegion.fromRect(layer.rect());
    } else {
      const seed = layer.cellAt(tilePos.x, tilePos.y);
      this.fillRegion = floodFillRegion(layer, tilePos, matchAny([seed]));
    }
    this.buildPreviewStamp();
  }

  private buildPreviewStamp(): void {
    if (!this.stamp || this.fillRegion.isEmpty()) {
      this.previewStamp = null;
      return;
    }
    const bb = this.fillRegion.boundingRect();
    const preview = new TileLayer('fill-preview', 0, 0, bb.width, bb.height);
    this.previewOrigin = { x: bb.x, y: bb.y };

    if (this.fillMethod === 'tile') {
      const variation = this.stamp.randomVariation(this.rng);
      if (!variation) {
        this.previewStamp = null;
        return;
      }
      const src = variation.layer;
      for (const p of this.fillRegion) {
        const lx = p.x - bb.x;
        const ly = p.y - bb.y;
        preview.setCell(lx, ly, src.cellAt(lx % src.width, ly % src.height));
      }
    } else {
      // 'random' or 'wang' — per-cell variation pick.
      for (const p of this.fillRegion) {
        const variation = this.stamp.randomVariation(this.rng);
        if (!variation) continue;
        const src = variation.layer;
        // Use the first non-empty cell of the variation (typical for 1×1 variations).
        let cellToWrite: Cell = Cell.empty;
        outer: for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            const c = src.cellAt(x, y);
            if (!c.isEmpty()) {
              cellToWrite = c;
              break outer;
            }
          }
        }
        preview.setCell(p.x - bb.x, p.y - bb.y, cellToWrite);
      }
    }
    this.previewStamp = preview;
  }

  private paintInto(cmd: PaintTileLayer, layer: TileLayer): void {
    if (!this.previewStamp) return;
    cmd.paint(
      layer,
      this.previewOrigin.x,
      this.previewOrigin.y,
      this.previewStamp,
      this.fillRegion,
    );
  }
}
