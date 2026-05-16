// Wrapper around `ObjectGroup` (the "Object Layer" in the editor). Mirrors
// EditableObjectGroup from src/tiled/editableobjectgroup.h.

import { ObjectGroup, type MapObject } from '@tiled-ts/core';
import { AddMapObjects, RemoveMapObjects } from '@tiled-ts/commands';

import { EditableLayer } from './editableLayer.js';
import { EditableMapObject } from './editableMapObject.js';

export class EditableObjectGroup extends EditableLayer {
  override readonly raw: ObjectGroup;

  constructor(raw: ObjectGroup | string = '') {
    const og = raw instanceof ObjectGroup ? raw : new ObjectGroup(raw);
    super(og);
    this.raw = og;
  }

  get objectCount(): number {
    return this.raw.objectCount();
  }

  objects(): EditableMapObject[] {
    return this.raw.objects.map((o) => this.wrapObject(o));
  }

  objectAt(i: number): EditableMapObject | undefined {
    const o = this.raw.objectAt(i);
    return o ? this.wrapObject(o) : undefined;
  }

  addObject(obj: EditableMapObject | MapObject): EditableMapObject {
    const raw = obj instanceof EditableMapObject ? obj.raw : obj;
    const doc = this.host?.activeDocument();
    if (doc) {
      doc.undoStack.push(new AddMapObjects(doc, this.raw, [raw]));
    } else {
      if (raw.id === 0 && this.raw.map) raw.setId(this.raw.map.takeNextObjectId());
      this.raw.addObject(raw);
    }
    return this.wrapObject(raw);
  }

  removeObject(obj: EditableMapObject | MapObject): void {
    const raw = obj instanceof EditableMapObject ? obj.raw : obj;
    const doc = this.host?.activeDocument();
    if (doc) {
      doc.undoStack.push(new RemoveMapObjects(doc, [raw]));
    } else {
      this.raw.removeObject(raw);
    }
  }

  private wrapObject(o: MapObject): EditableMapObject {
    const wrapped = new EditableMapObject(o);
    wrapped.host = this.host;
    return wrapped;
  }
}
