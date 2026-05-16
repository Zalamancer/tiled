// Port of src/tiled/painttilelayer.{h,cpp}.
//
// Paint operation against one or more tile layers. Supports merging — the
// stamp brush builds up a single `PaintTileLayer` as the user drags, so that
// the entire stroke is one undo entry.
//
// `paintRegion` is in TARGET-LOCAL coordinates (i.e. the same space as
// `target.cellAt`). `sourceX` / `sourceY` give the position of the source
// layer's (0, 0) cell within the target.

import { Cell, type TileLayer, TileRegion } from '@tiled-ts/core';

import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

interface LayerData {
  /** Cells to apply on redo. Keys are target-local. */
  source: TwoDCellGrid;
  /** Cells originally present. Keys are target-local. */
  erased: TwoDCellGrid;
  /** Set of target-local positions touched by this command. */
  region: TileRegion;
}

class TwoDCellGrid {
  private cells = new Map<number, Cell>();
  set(x: number, y: number, cell: Cell): void {
    this.cells.set(this.key(x, y), Cell.from(cell));
  }
  get(x: number, y: number): Cell {
    return this.cells.get(this.key(x, y)) ?? Cell.empty;
  }
  has(x: number, y: number): boolean {
    return this.cells.has(this.key(x, y));
  }
  *entries(): IterableIterator<[number, number, Cell]> {
    for (const [k, c] of this.cells) {
      const y = Math.floor(k / 0x10000) - 0x8000;
      const x = (k & 0xffff) - 0x8000;
      yield [x, y, c];
    }
  }
  private key(x: number, y: number): number {
    return (y + 0x8000) * 0x10000 + (x + 0x8000);
  }
}

export class PaintTileLayer implements UndoCommand {
  readonly id = UndoCommandId.PaintTileLayer;
  text = 'Paint';
  private mergeable = false;
  private layerData = new Map<TileLayer, LayerData>();

  constructor(private readonly doc: MapDocument) {}

  setMergeable(b: boolean): this {
    this.mergeable = b;
    return this;
  }

  /** Add a paint stroke to this command. Can be called multiple times before
   *  `redo()` to batch overlapping regions. */
  paint(target: TileLayer, sourceX: number, sourceY: number, source: TileLayer, region: TileRegion): void {
    const data: LayerData = {
      source: new TwoDCellGrid(),
      erased: new TwoDCellGrid(),
      region: new TileRegion(),
    };
    for (const p of region) {
      data.source.set(p.x, p.y, source.cellAt(p.x - sourceX, p.y - sourceY));
      data.erased.set(p.x, p.y, target.cellAt(p.x, p.y));
      data.region.addCell(p.x, p.y);
    }
    const existing = this.layerData.get(target);
    if (existing) this.mergeLayerData(existing, data);
    else this.layerData.set(target, data);
  }

  /** Convenience: replace every cell in `region` with the empty cell. */
  erase(target: TileLayer, region: TileRegion): void {
    const data: LayerData = {
      source: new TwoDCellGrid(),
      erased: new TwoDCellGrid(),
      region: new TileRegion(),
    };
    const empty = new Cell();
    for (const p of region) {
      data.source.set(p.x, p.y, empty);
      data.erased.set(p.x, p.y, target.cellAt(p.x, p.y));
      data.region.addCell(p.x, p.y);
    }
    const existing = this.layerData.get(target);
    if (existing) this.mergeLayerData(existing, data);
    else this.layerData.set(target, data);
  }

  redo(): void {
    for (const [target, data] of this.layerData) {
      for (const [x, y, cell] of data.source.entries()) target.setCell(x, y, cell);
      this.doc.emit({ kind: 'layer-changed', map: this.doc.map, layer: target, properties: 0 });
    }
  }

  undo(): void {
    for (const [target, data] of this.layerData) {
      for (const [x, y, cell] of data.erased.entries()) target.setCell(x, y, cell);
      this.doc.emit({ kind: 'layer-changed', map: this.doc.map, layer: target, properties: 0 });
    }
  }

  mergeWith(other: UndoCommand): boolean {
    const o = other as PaintTileLayer;
    if (o.doc !== this.doc) return false;
    if (!o.mergeable) return false;
    for (const [layer, otherData] of o.layerData) {
      const existing = this.layerData.get(layer);
      if (existing) this.mergeLayerData(existing, otherData);
      else this.layerData.set(layer, otherData);
    }
    return true;
  }

  private mergeLayerData(into: LayerData, from: LayerData): void {
    for (const [x, y, cell] of from.source.entries()) {
      // Always overwrite source (the more recent stroke wins).
      into.source.set(x, y, cell);
      // Preserve erased state: keep our snapshot, only fill new entries.
      if (!into.region.contains({ x, y })) {
        into.erased.set(x, y, from.erased.get(x, y));
      }
      into.region.addCell(x, y);
    }
  }
}

export class EraseTilesCommand implements UndoCommand {
  readonly id = UndoCommandId.EraseTiles;
  text = 'Erase Tiles';
  private paint: PaintTileLayer;

  constructor(doc: MapDocument, target: TileLayer, region: TileRegion) {
    this.paint = new PaintTileLayer(doc);
    this.paint.erase(target, region);
  }
  redo(): void { this.paint.redo(); }
  undo(): void { this.paint.undo(); }
  mergeWith(o: UndoCommand): boolean {
    return this.paint.mergeWith((o as EraseTilesCommand).paint);
  }
}
