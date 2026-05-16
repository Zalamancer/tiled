// Port of src/tiled/changemapproperty.{h,cpp} — single-property edits.

import type { ColorString, MapOrientation, RenderOrder, Size } from '@tiled-ts/core';
import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

abstract class ChangeMapValue<V> implements UndoCommand {
  abstract id: number;
  abstract text: string;
  protected oldValue!: V;

  constructor(protected readonly doc: MapDocument, protected newValue: V) {}

  protected abstract read(): V;
  protected abstract write(v: V): void;

  redo(): void {
    this.oldValue = this.read();
    this.write(this.newValue);
    this.doc.emit({ kind: 'map-changed', map: this.doc.map });
  }
  undo(): void {
    this.write(this.oldValue);
    this.doc.emit({ kind: 'map-changed', map: this.doc.map });
  }
  mergeWith(other: UndoCommand): boolean {
    const o = other as ChangeMapValue<V>;
    if (o.id !== this.id) return false;
    this.newValue = o.newValue;
    return true;
  }
}

export class SetMapBackgroundColor extends ChangeMapValue<ColorString | undefined> {
  id = UndoCommandId.ChangeMapBackgroundColor;
  text = 'Change Background Color';
  protected read(): ColorString | undefined { return this.doc.map.backgroundColor; }
  protected write(v: ColorString | undefined): void { this.doc.map.setBackgroundColor(v); }
}

export class SetMapTileSize extends ChangeMapValue<Size> {
  id = UndoCommandId.ChangeMapTileSize;
  text = 'Change Tile Size';
  protected read(): Size { return this.doc.map.tileSize; }
  protected write(v: Size): void { this.doc.map.setTileSize(v); }
}

export class SetMapOrientation extends ChangeMapValue<MapOrientation> {
  id = UndoCommandId.ChangeMapOrientation;
  text = 'Change Map Orientation';
  protected read(): MapOrientation { return this.doc.map.orientation; }
  protected write(v: MapOrientation): void { this.doc.map.setOrientation(v); }
}

export class SetMapRenderOrder extends ChangeMapValue<RenderOrder> {
  id = UndoCommandId.ChangeMapRenderOrder;
  text = 'Change Render Order';
  protected read(): RenderOrder { return this.doc.map.renderOrder; }
  protected write(v: RenderOrder): void { this.doc.map.setRenderOrder(v); }
}

export class SetMapInfinite extends ChangeMapValue<boolean> {
  id = UndoCommandId.ChangeMapInfinite;
  text = 'Toggle Infinite';
  protected read(): boolean { return this.doc.map.infinite; }
  protected write(v: boolean): void { this.doc.map.setInfinite(v); }
}

/** Resize the map. Layers are *not* clipped — call `normalize…` afterwards. */
export class ResizeMap extends ChangeMapValue<Size> {
  id = UndoCommandId.SetMapRect;
  text = 'Resize Map';
  protected read(): Size { return this.doc.map.size; }
  protected write(v: Size): void {
    this.doc.map.setWidth(v.width);
    this.doc.map.setHeight(v.height);
  }
}
