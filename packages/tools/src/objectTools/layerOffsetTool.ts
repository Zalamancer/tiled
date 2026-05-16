// Port of src/tiled/layeroffsettool.{h,cpp}.
//
// Drags the active layer's `offset`. Clamps to whole-pixel units when Ctrl is
// held (matching the upstream snap-to-pixel toggle). Commits one undo on
// pointer-up.

import type { Point } from '@tiled-ts/core';
import { SetLayerOffset } from '@tiled-ts/commands';
import { Tool, type ToolPointerEvent, type ToolPreview } from '../tool.js';

export class LayerOffsetTool extends Tool {
  private down = false;
  private startMouse: Point = { x: 0, y: 0 };
  private startOffset: Point = { x: 0, y: 0 };

  constructor() {
    super('LayerOffset', 'Layer Offset');
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    const ctx = this.requireCtx();
    const layer = ctx.currentLayer();
    if (!layer) return;
    this.down = true;
    this.startMouse = e.position;
    this.startOffset = { ...layer.offset };
  }

  override pointerMove(e: ToolPointerEvent): void {
    if (!this.down) return;
    const ctx = this.requireCtx();
    const layer = ctx.currentLayer();
    if (!layer) return;
    let dx = e.position.x - this.startMouse.x;
    let dy = e.position.y - this.startMouse.y;
    if (e.modifiers.ctrl) {
      dx = Math.round(dx);
      dy = Math.round(dy);
    }
    layer.offset = { x: this.startOffset.x + dx, y: this.startOffset.y + dy };
    ctx.invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.down || e.button !== 'left') return;
    this.down = false;
    const ctx = this.requireCtx();
    const layer = ctx.currentLayer();
    if (!layer) return;
    const final = { ...layer.offset };
    if (final.x === this.startOffset.x && final.y === this.startOffset.y) return;
    // Restore start offset so the command captures the correct oldValue.
    layer.offset = this.startOffset;
    ctx.push(new SetLayerOffset(ctx.doc, layer, final));
  }

  override preview(): ToolPreview | null {
    return null;
  }
}
