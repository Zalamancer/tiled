// Wrapper around `TileLayer`. Mirrors EditableTileLayer from
// src/tiled/editabletilelayer.h.
//
// `setCell` is implemented by building a `PaintTileLayer` command containing a
// single-cell stamp, so a single setCell call rolls into the undo stack when a
// document is active. Without a document, the wrapper writes directly to the
// underlying TileLayer.

import { Cell, TileLayer, TileRegion } from '@tiled-ts/core';
import { PaintTileLayer } from '@tiled-ts/commands';

import { EditableLayer } from './editableLayer.js';
import { EditableTile } from './editableTile.js';

export class EditableTileLayer extends EditableLayer {
  override readonly raw: TileLayer;

  constructor(raw: TileLayer | string = '', size?: { width: number; height: number }) {
    const tl =
      raw instanceof TileLayer
        ? raw
        : new TileLayer(raw, 0, 0, size?.width ?? 0, size?.height ?? 0);
    super(tl);
    this.raw = tl;
  }

  get width(): number {
    return this.raw.width;
  }
  get height(): number {
    return this.raw.height;
  }
  get size(): { width: number; height: number } {
    return this.raw.size;
  }

  cellAt(x: number, y: number): Cell {
    return this.raw.cellAt(x, y);
  }

  tileAt(x: number, y: number): EditableTile | undefined {
    const c = this.raw.cellAt(x, y);
    const t = c.tile();
    return t ? new EditableTile(t) : undefined;
  }

  flagsAt(x: number, y: number): number {
    return this.raw.cellAt(x, y).flags;
  }

  /** Set a single cell, routing through the undo stack when a doc is active. */
  setCell(x: number, y: number, cell: Cell): void {
    const doc = this.host?.activeDocument();
    if (doc) {
      const stamp = new TileLayer('', 0, 0, 1, 1);
      stamp.setCell(0, 0, cell);
      const region = new TileRegion();
      region.addCell(x, y);
      const cmd = new PaintTileLayer(doc);
      cmd.paint(this.raw, x, y, stamp, region);
      doc.undoStack.push(cmd);
    } else {
      this.raw.setCell(x, y, cell);
    }
  }
}
