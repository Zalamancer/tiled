// Port of src/tiled/selectsametiletool.{h,cpp}.
//
// Computes the set of cells equal to the cell under the cursor. The result
// is exposed via `lastSelection`; integration with `MapDocument.selectedArea`
// is the host's responsibility.

import { Cell, type Point, TileRegion } from '@tiled-ts/core';
import { Tool, type ToolPointerEvent, type ToolPreview } from './tool.js';

export class SelectSameTileTool extends Tool {
  /** Most recent selection result (target-local cells). */
  lastSelection: TileRegion = new TileRegion();
  private hover: Point = { x: 0, y: 0 };

  constructor() {
    super('SelectSameTile', 'Select Same Tile');
  }

  override pointerMove(e: ToolPointerEvent): void {
    this.hover = e.tilePos;
    this.requireCtx().invalidate();
  }

  override pointerDown(e: ToolPointerEvent): void {
    const layer = this.currentTileLayer();
    if (!layer || e.button !== 'left') return;
    const target = layer.cellAt(e.tilePos.x, e.tilePos.y);
    const region = new TileRegion();
    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        if (layer.cellAt(x, y).equals(target)) region.addCell(x, y);
      }
    }
    this.lastSelection = region;
    this.requireCtx().invalidate();
  }

  override preview(): ToolPreview | null {
    if (this.lastSelection.isEmpty()) return null;
    return { stamp: null, origin: this.hover, region: this.lastSelection };
  }

  // Re-export the imported Cell so tree-shakers don't drop it from the bundle
  // when the public API doesn't reference it elsewhere.
  static _unused: typeof Cell = Cell;
}
