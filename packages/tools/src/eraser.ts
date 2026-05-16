// Port of src/tiled/eraser.{h,cpp}.

import { Cell, type Point, type TileLayer, TileRegion } from '@tiled-ts/core';
import { PaintTileLayer } from '@tiled-ts/commands';
import { Tool, type ToolPointerEvent, type ToolPreview } from './tool.js';

export class EraserTool extends Tool {
  private down = false;
  private currentCmd: PaintTileLayer | null = null;
  private hoverRegion: TileRegion = new TileRegion();
  private lastPos: Point = { x: 0, y: 0 };

  constructor() {
    super('Eraser', 'Eraser');
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    if (!this.currentTileLayer()) return;
    this.down = true;
    this.currentCmd = new PaintTileLayer(this.requireCtx().doc).setMergeable(true);
    this.currentCmd.text = 'Erase';
    this.eraseAt(e.tilePos);
  }

  override pointerMove(e: ToolPointerEvent): void {
    this.lastPos = e.tilePos;
    this.hoverRegion = new TileRegion();
    this.hoverRegion.addCell(e.tilePos.x, e.tilePos.y);
    if (this.down) this.eraseAt(e.tilePos);
    this.requireCtx().invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.down) return;
    if (e.button !== 'left') return;
    this.down = false;
    const cmd = this.currentCmd;
    this.currentCmd = null;
    if (cmd) this.requireCtx().push(cmd);
  }

  override preview(): ToolPreview | null {
    if (this.hoverRegion.isEmpty()) return null;
    return { stamp: null, origin: this.lastPos, region: this.hoverRegion };
  }

  private eraseAt(tilePos: Point): void {
    const layer = this.currentTileLayer();
    if (!layer || !this.currentCmd) return;
    if (!layer.contains(tilePos.x, tilePos.y)) return;
    const region = new TileRegion();
    region.addCell(tilePos.x, tilePos.y);
    this.currentCmd.erase(layer, region);
    // Apply live; redo() is idempotent so the final push is safe.
    layer.setCell(tilePos.x, tilePos.y, new Cell());
  }
}
