// Port of src/tiled/movelayer.{h,cpp}.

import type { Layer } from '@tiled-ts/core';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

export class MoveLayer implements UndoCommand {
  text: string;
  private fromIndex: number;
  private toIndex: number;
  private fromParent: Layer['parentLayer'];
  private toParent: Layer['parentLayer'];

  constructor(private readonly doc: MapDocument, private readonly layer: Layer, toIndex: number) {
    this.fromIndex = layer.siblingIndex();
    this.toIndex = toIndex;
    this.fromParent = layer.parentLayer;
    this.toParent = layer.parentLayer;
    this.text = `Move Layer "${layer.name}"`;
  }

  redo(): void {
    this.move(this.fromIndex, this.toIndex);
  }
  undo(): void {
    this.move(this.toIndex, this.fromIndex);
  }

  private move(from: number, to: number): void {
    const parent = this.fromParent;
    if (parent) {
      const removed = parent.takeLayerAt(from);
      if (removed) parent.insertLayer(to, removed);
    } else {
      const removed = this.doc.map.takeLayerAt(from);
      if (removed) this.doc.map.insertLayer(to, removed);
    }
    this.doc.emit({
      kind: 'layer-added',
      map: this.doc.map,
      layer: this.layer,
      parent: this.toParent,
      index: to,
    });
  }
}
