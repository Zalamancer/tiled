// Port of src/tiled/wangbrush.{h,cpp} — simplified to the core paint flow.
//
// Supports the three Tiled brush modes:
//   - corner: drag along corners. Each click affects the 4 cells around the
//     nearest grid corner.
//   - edge:   drag along edges. Each click affects the 2 cells around the
//     nearest edge.
//   - mixed:  one cell directly under the cursor, full WangId replaced.

import {
  Cell,
  type Point,
  TileLayer,
  TileRegion,
  type WangSet,
  WangIndex,
} from '@tiled-ts/core';
import { PaintTileLayer } from '@tiled-ts/commands';
import { Tool, type ToolPointerEvent, type ToolPreview } from './tool.js';
import { WangFiller } from './wangFiller.js';

export type WangBrushMode = 'corner' | 'edge' | 'mixed';

export class WangBrush extends Tool {
  wangSet: WangSet | null = null;
  /** Currently selected color index (1-based; 0 = no colour / wildcard). */
  color = 1;
  mode: WangBrushMode = 'corner';
  rng: (() => number) | undefined;

  private down = false;
  private currentCmd: PaintTileLayer | null = null;
  private region: TileRegion = new TileRegion();
  private previewStamp: TileLayer | null = null;
  private previewOrigin: Point = { x: 0, y: 0 };

  constructor() {
    super('WangBrush', 'Wang Brush');
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left' && e.button !== 'right') return;
    const layer = this.currentTileLayer();
    if (!layer || !this.wangSet) return;
    this.down = true;
    this.currentCmd = new PaintTileLayer(this.requireCtx().doc).setMergeable(true);
    this.currentCmd.text = 'Wang Brush';
    this.paintAt(e, e.button === 'right');
  }

  override pointerMove(e: ToolPointerEvent): void {
    this.updateHover(e);
    if (this.down) {
      const erasing = e.buttons === 2; // right-button mask
      this.paintAt(e, erasing);
    }
    this.requireCtx().invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.down) return;
    this.down = false;
    const cmd = this.currentCmd;
    this.currentCmd = null;
    if (cmd) this.requireCtx().push(cmd);
    this.updateHover(e);
  }

  override preview(): ToolPreview | null {
    if (!this.previewStamp || this.region.isEmpty()) return null;
    return { stamp: this.previewStamp, origin: this.previewOrigin, region: this.region };
  }

  /* ─── internals ─── */

  private updateHover(e: ToolPointerEvent): void {
    if (!this.wangSet || !this.currentTileLayer()) {
      this.previewStamp = null;
      this.region = new TileRegion();
      return;
    }
    this.computeStamp(e.tilePos, e.position, false);
  }

  private paintAt(e: ToolPointerEvent, erase: boolean): void {
    const layer = this.currentTileLayer();
    if (!layer || !this.currentCmd) return;

    this.computeStamp(e.tilePos, e.position, erase);
    if (!this.previewStamp || this.region.isEmpty()) return;

    this.currentCmd.paint(
      layer,
      this.previewOrigin.x,
      this.previewOrigin.y,
      this.previewStamp,
      this.region,
    );

    // Live-apply.
    for (const p of this.region) {
      const c = this.previewStamp.cellAt(p.x - this.previewOrigin.x, p.y - this.previewOrigin.y);
      layer.setCell(p.x, p.y, c);
    }
  }

  /** Build a fresh preview stamp + region for the given cursor position. */
  private computeStamp(tilePos: Point, pixelPos: Point, erase: boolean): void {
    const layer = this.currentTileLayer();
    if (!layer || !this.wangSet) return;

    const filler = new WangFiller({
      wangSet: this.wangSet,
      baseLayer: layer,
      rng: this.rng,
    });
    const color = erase ? 0 : this.color;

    const affected: Point[] = [];

    if (this.mode === 'mixed') {
      affected.push(tilePos);
      // Set every position of the cell to `color`. Mixed mode rewrites.
      for (let i = 0; i < 8; i++) filler.setIndex(tilePos.x, tilePos.y, i, color);
    } else if (this.mode === 'corner') {
      // Nearest corner: round the pixel position to the closest grid line.
      const tw = this.requireCtx().doc.map.tileWidth;
      const th = this.requireCtx().doc.map.tileHeight;
      const cornerX = Math.round(pixelPos.x / tw);
      const cornerY = Math.round(pixelPos.y / th);
      // The 4 cells adjacent to that corner, with the corresponding wang index.
      const adj: [Point, WangIndex][] = [
        [{ x: cornerX - 1, y: cornerY - 1 }, WangIndex.BottomRight],
        [{ x: cornerX,     y: cornerY - 1 }, WangIndex.BottomLeft],
        [{ x: cornerX - 1, y: cornerY     }, WangIndex.TopRight],
        [{ x: cornerX,     y: cornerY     }, WangIndex.TopLeft],
      ];
      for (const [pos, index] of adj) {
        if (!layer.contains(pos.x, pos.y)) continue;
        filler.setIndex(pos.x, pos.y, index, color);
        affected.push(pos);
      }
    } else if (this.mode === 'edge') {
      // Nearest edge: pick horizontal or vertical depending on closeness.
      const tw = this.requireCtx().doc.map.tileWidth;
      const th = this.requireCtx().doc.map.tileHeight;
      const fx = pixelPos.x / tw - tilePos.x;
      const fy = pixelPos.y / th - tilePos.y;
      const dTop = fy;
      const dBottom = 1 - fy;
      const dLeft = fx;
      const dRight = 1 - fx;
      const min = Math.min(dTop, dBottom, dLeft, dRight);
      if (min === dTop && tilePos.y > 0) {
        filler.setIndex(tilePos.x, tilePos.y, WangIndex.Top, color);
        filler.setIndex(tilePos.x, tilePos.y - 1, WangIndex.Bottom, color);
        affected.push(tilePos, { x: tilePos.x, y: tilePos.y - 1 });
      } else if (min === dBottom) {
        filler.setIndex(tilePos.x, tilePos.y, WangIndex.Bottom, color);
        if (layer.contains(tilePos.x, tilePos.y + 1))
          filler.setIndex(tilePos.x, tilePos.y + 1, WangIndex.Top, color);
        affected.push(tilePos, { x: tilePos.x, y: tilePos.y + 1 });
      } else if (min === dLeft && tilePos.x > 0) {
        filler.setIndex(tilePos.x, tilePos.y, WangIndex.Left, color);
        filler.setIndex(tilePos.x - 1, tilePos.y, WangIndex.Right, color);
        affected.push(tilePos, { x: tilePos.x - 1, y: tilePos.y });
      } else {
        filler.setIndex(tilePos.x, tilePos.y, WangIndex.Right, color);
        if (layer.contains(tilePos.x + 1, tilePos.y))
          filler.setIndex(tilePos.x + 1, tilePos.y, WangIndex.Left, color);
        affected.push(tilePos, { x: tilePos.x + 1, y: tilePos.y });
      }
    }

    if (affected.length === 0) {
      this.previewStamp = null;
      this.region = new TileRegion();
      return;
    }

    const xs = affected.map((p) => p.x);
    const ys = affected.map((p) => p.y);
    const x1 = Math.min(...xs);
    const y1 = Math.min(...ys);
    const x2 = Math.max(...xs);
    const y2 = Math.max(...ys);
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const stamp = new TileLayer('wang-preview', 0, 0, w, h);

    // Apply filler and translate back to map coords.
    const tmp = new TileLayer('tmp', 0, 0, 0, 0);
    filler.apply(tmp);
    // tmp uses map-absolute coords; copy into our local-coord stamp.
    const region = new TileRegion();
    for (const pos of affected) {
      if (!layer.contains(pos.x, pos.y)) continue;
      const tmpCell = tmp.cellAt(pos.x, pos.y);
      if (tmpCell.isEmpty() && color !== 0) continue;
      stamp.setCell(pos.x - x1, pos.y - y1, tmpCell.isEmpty() ? new Cell() : tmpCell);
      region.addCell(pos.x, pos.y);
    }
    this.previewStamp = stamp;
    this.previewOrigin = { x: x1, y: y1 };
    this.region = region;
  }
}
