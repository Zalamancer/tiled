// Port of src/tiled/addremovemapobject.{h,cpp}.

import type { MapObject, ObjectGroup } from '@tiled-ts/core';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

interface Entry {
  object: MapObject;
  group: ObjectGroup;
  index: number;
}

export class AddMapObjects implements UndoCommand {
  text: string;
  private entries: Entry[];

  constructor(doc: MapDocument, group: ObjectGroup, objects: MapObject[]) {
    this.doc = doc;
    this.entries = objects.map((o) => ({ object: o, group, index: group.objectCount() }));
    this.text = objects.length === 1 ? 'Add Object' : `Add ${objects.length} Objects`;
  }
  private doc: MapDocument;

  redo(): void {
    for (const e of this.entries) {
      if (e.object.id === 0) e.object.setId(this.doc.map.takeNextObjectId());
      e.group.insertObject(e.index, e.object);
    }
    this.doc.emit({
      kind: 'objects-added',
      map: this.doc.map,
      objectGroup: this.entries[0]!.group,
      objects: this.entries.map((e) => e.object),
    });
  }
  undo(): void {
    for (const e of [...this.entries].reverse()) e.group.removeObjectAt(e.index);
    this.doc.emit({
      kind: 'objects-removed',
      map: this.doc.map,
      objectGroup: this.entries[0]!.group,
      objects: this.entries.map((e) => e.object),
    });
  }
}

export class RemoveMapObjects implements UndoCommand {
  text: string;
  private entries: Entry[];
  private doc: MapDocument;

  constructor(doc: MapDocument, objects: MapObject[]) {
    this.doc = doc;
    this.entries = objects.map((o) => {
      const group = o.objectGroup;
      if (!group) throw new Error('cannot remove object not in a group');
      return { object: o, group, index: group.objects.indexOf(o) };
    });
    this.text = objects.length === 1 ? 'Remove Object' : `Remove ${objects.length} Objects`;
  }

  redo(): void {
    const removed = [...this.entries].reverse();
    for (const e of removed) e.group.removeObjectAt(e.index);
    this.doc.emit({
      kind: 'objects-removed',
      map: this.doc.map,
      objectGroup: this.entries[0]!.group,
      objects: this.entries.map((e) => e.object),
    });
  }
  undo(): void {
    for (const e of this.entries) e.group.insertObject(e.index, e.object);
    this.doc.emit({
      kind: 'objects-added',
      map: this.doc.map,
      objectGroup: this.entries[0]!.group,
      objects: this.entries.map((e) => e.object),
      index: 0,
    } as never);
  }
}
