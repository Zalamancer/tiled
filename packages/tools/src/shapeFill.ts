// Port of src/tiled/shapefilltool.{h,cpp}.
//
// Click-and-drag to fill an axis-aligned rectangle or filled ellipse with the
// active stamp. Preview updates continuously while dragging; one undo command
// is pushed on release.

import { Cell, type Point, TileLayer, TileRegion } from '@tiled-ts/core';
import { PaintTileLayer } from '@tiled-ts/commands';
import { Tool, type ToolPointerEvent, type ToolPreview } from './tool.js';
import type { TileStamp } from './tileStamp.js';

export type ShapeFillShape = 'rectangle' | 'ellipse';

export class ShapeFillTool extends Tool {
  stamp: TileStamp | null = null;
  shape: ShapeFillShape = 'rectangle';
  rng: (() => number) | undefined;

  private down = false;
  private startTile: Point = { x: 0, y: 0 };
  private hoverTile: Point = { x: 0, y: 0 };
  private region: TileRegion = new TileRegion();
  private previewStamp: TileLayer | null = null;
  private previewOrigin: Point = { x: 0, y: 0 };

  constructor() {
    super('ShapeFill', 'Shape Fill');
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    if (!this.currentTileLayer() || !this.stamp || this.stamp.isEmpty()) return;
    this.down = true;
    this.startTile = e.tilePos;
    this.hoverTile = e.tilePos;
    this.updateRegion();
  }

  override pointerMove(e: ToolPointerEvent): void {
    this.hoverTile = e.tilePos;
    if (!this.down) this.startTile = e.tilePos;
    this.updateRegion();
    this.requireCtx().invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.down || e.button !== 'left') return;
    this.down = false;
    const layer = this.currentTileLayer();
    if (!layer || this.region.isEmpty() || !this.previewStamp) return;
    const cmd = new PaintTileLayer(this.requireCtx().doc);
    cmd.text = this.shape === 'rectangle' ? 'Fill Rectangle' : 'Fill Ellipse';
    cmd.paint(layer, this.previewOrigin.x, this.previewOrigin.y, this.previewStamp, this.region);
    this.requireCtx().push(cmd);
  }

  override preview(): ToolPreview | null {
    if (!this.previewStamp || this.region.isEmpty()) return null;
    return { stamp: this.previewStamp, origin: this.previewOrigin, region: this.region };
  }

  private updateRegion(): void {
    if (!this.stamp) {
      this.region = new TileRegion();
      this.previewStamp = null;
      return;
    }
    const x1 = Math.min(this.startTile.x, this.hoverTile.x);
    const y1 = Math.min(this.startTile.y, this.hoverTile.y);
    const x2 = Math.max(this.startTile.x, this.hoverTile.x);
    const y2 = Math.max(this.startTile.y, this.hoverTile.y);
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    this.region = new TileRegion();
    if (this.shape === 'rectangle') {
      this.region.addRect({ x: x1, y: y1, width: w, height: h });
    } else {
      const cx = (x1 + x2 + 1) / 2;
      const cy = (y1 + y2 + 1) / 2;
      const rx = w / 2;
      const ry = h / 2;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) this.region.addCell(x, y);
        }
      }
    }
    this.buildPreview(x1, y1, w, h);
  }

  private buildPreview(x: number, y: number, w: number, h: number): void {
    if (!this.stamp) return;
    const variation = this.stamp.randomVariation(this.rng);
    if (!variation) return;
    const src = variation.layer;
    const preview = new TileLayer('shape-preview', 0, 0, w, h);
    for (const p of this.region) {
      const lx = p.x - x;
      const ly = p.y - y;
      preview.setCell(lx, ly, src.cellAt(lx % src.width, ly % src.height));
    }
    this.previewStamp = preview;
    this.previewOrigin = { x, y };
    // suppress unused
    void Cell.empty;
  }
}
