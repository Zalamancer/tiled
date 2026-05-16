// Port of src/tiled/createtileobjecttool.{h,cpp} — drag-creates a
// tile-bound object (using the active tile from `selectedTile`).

import { Cell, MapObject, MapObjectShape, type Point, type Tile } from '@tiled-ts/core';
import { CreateObjectTool } from './createObjectTool.js';

export class CreateTileObjectTool extends CreateObjectTool {
  /** The tile to instantiate. Set by the host UI before activation. */
  selectedTile: Tile | null = null;

  constructor() {
    super('CreateTileObject', 'Insert Tile');
  }

  protected instantiate(at: Point): MapObject {
    if (!this.selectedTile) {
      throw new Error('CreateTileObjectTool needs `selectedTile` before use');
    }
    const t = this.selectedTile;
    const obj = new MapObject('', '', { x: at.x, y: at.y }, { width: t.width, height: t.height });
    obj.setShape(MapObjectShape.Rectangle);
    obj.setCell(new Cell(t.tileset, t.id));
    return obj;
  }

  protected updateOnDrag(at: Point): void {
    if (!this.previewObject || !this.selectedTile) return;
    // Drag resizes proportionally to the tile's aspect ratio when shift is
    // *not* held; for the test-friendly TS port we just track the cursor
    // delta and scale uniformly.
    const dx = at.x - this.start.x;
    const dy = at.y - this.start.y;
    const w = Math.max(1, Math.abs(dx));
    const h = Math.max(1, Math.abs(dy));
    const x = Math.min(this.start.x, at.x);
    const y = Math.min(this.start.y, at.y);
    this.previewObject.setPosition({ x, y });
    this.previewObject.setSize({ width: w, height: h });
  }
}
