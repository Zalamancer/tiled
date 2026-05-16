// Port of src/tiled/changemapobject.{h,cpp}.

import {
  MapObjectShape,
  type MapObject,
  MapObjectChangedProperty,
  type Point,
  type Size,
} from '@tiled-ts/core';
import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

abstract class ChangeMapObjectCommand<V> implements UndoCommand {
  abstract id: number;
  abstract text: string;
  protected oldValue!: V;

  constructor(
    protected readonly doc: MapDocument,
    protected readonly target: MapObject,
    protected newValue: V,
  ) {}

  protected abstract read(o: MapObject): V;
  protected abstract write(o: MapObject, v: V): void;
  protected abstract changedFlag(): MapObjectChangedProperty;

  redo(): void {
    this.oldValue = this.read(this.target);
    this.write(this.target, this.newValue);
    this.target.setPropertyChanged(this.changedFlag());
    this.fire();
  }
  undo(): void {
    this.write(this.target, this.oldValue);
    this.fire();
  }

  protected fire(): void {
    this.doc.emit({
      kind: 'objects-changed',
      map: this.doc.map,
      objects: [this.target],
      properties: this.changedFlag(),
    });
  }

  mergeWith(other: UndoCommand): boolean {
    const o = other as ChangeMapObjectCommand<V>;
    if (o.target !== this.target || o.id !== this.id) return false;
    this.newValue = o.newValue;
    return true;
  }
}

export class SetObjectName extends ChangeMapObjectCommand<string> {
  id = UndoCommandId.ChangeMapObject;
  text = 'Rename Object';
  protected read(o: MapObject): string { return o.name; }
  protected write(o: MapObject, v: string): void { o.setName(v); }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.Name; }
}

export class SetObjectClass extends ChangeMapObjectCommand<string> {
  id = UndoCommandId.ChangeMapObject;
  text = 'Change Object Class';
  protected read(o: MapObject): string { return o.className; }
  protected write(o: MapObject, v: string): void { o.setClassName(v); }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.CustomProperties; }
}

export class SetObjectVisible extends ChangeMapObjectCommand<boolean> {
  id = UndoCommandId.ChangeMapObject;
  text = 'Toggle Object Visibility';
  protected read(o: MapObject): boolean { return o.visible; }
  protected write(o: MapObject, v: boolean): void { o.visible = v; }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.Visible; }
}

export class SetObjectPosition extends ChangeMapObjectCommand<Point> {
  id = UndoCommandId.ChangeMapObjectTransform;
  text = 'Move Object';
  protected read(o: MapObject): Point { return o.position; }
  protected write(o: MapObject, v: Point): void { o.setPosition(v); }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.Position; }
}

export class SetObjectSize extends ChangeMapObjectCommand<Size> {
  id = UndoCommandId.ChangeMapObjectTransform;
  text = 'Resize Object';
  protected read(o: MapObject): Size { return o.size; }
  protected write(o: MapObject, v: Size): void { o.setSize(v); }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.Size; }
}

export class SetObjectRotation extends ChangeMapObjectCommand<number> {
  id = UndoCommandId.ChangeMapObjectTransform;
  text = 'Rotate Object';
  protected read(o: MapObject): number { return o.rotation; }
  protected write(o: MapObject, v: number): void { o.rotation = v; }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.Rotation; }
}

export class SetObjectShape extends ChangeMapObjectCommand<MapObjectShape> {
  id = UndoCommandId.ChangeMapObject;
  text = 'Change Object Shape';
  protected read(o: MapObject): MapObjectShape { return o.shape; }
  protected write(o: MapObject, v: MapObjectShape): void { o.setShape(v); }
  protected changedFlag(): MapObjectChangedProperty { return MapObjectChangedProperty.Shape; }
}
