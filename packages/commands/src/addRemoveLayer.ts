// Port of src/tiled/addremovelayer.{h,cpp}.

import { GroupLayer, type Layer } from '@tiled-ts/core';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

abstract class AddRemoveLayer {
  protected layer: Layer;
  protected parentLayer: GroupLayer | undefined;
  protected index: number;
  protected doc: MapDocument;

  constructor(doc: MapDocument, index: number, layer: Layer, parentLayer?: GroupLayer) {
    this.doc = doc;
    this.layer = layer;
    this.parentLayer = parentLayer;
    this.index = index;
  }

  protected add(): void {
    if (this.parentLayer) this.parentLayer.insertLayer(this.index, this.layer);
    else this.doc.map.insertLayer(this.index, this.layer);
    this.doc.emit({
      kind: 'layer-added',
      map: this.doc.map,
      layer: this.layer,
      parent: this.parentLayer,
      index: this.index,
    });
  }

  protected remove(): void {
    this.doc.emit({ kind: 'layer-about-to-be-removed', map: this.doc.map, layer: this.layer });
    if (this.parentLayer) this.parentLayer.takeLayerAt(this.index);
    else this.doc.map.takeLayerAt(this.index);
    this.doc.emit({ kind: 'layer-removed', map: this.doc.map, layer: this.layer });
  }
}

export class AddLayer extends AddRemoveLayer implements UndoCommand {
  text: string;

  constructor(doc: MapDocument, index: number, layer: Layer, parentLayer?: GroupLayer) {
    super(doc, index, layer, parentLayer);
    this.text = `Add Layer "${layer.name}"`;
  }

  redo(): void {
    this.add();
  }
  undo(): void {
    this.remove();
  }
}

export class RemoveLayer extends AddRemoveLayer implements UndoCommand {
  text: string;

  constructor(doc: MapDocument, index: number, parentLayer?: GroupLayer) {
    const list = parentLayer ? parentLayer.layers : doc.map.layers;
    const layer = list[index];
    if (!layer) throw new Error(`no layer at index ${index}`);
    super(doc, index, layer, parentLayer);
    this.text = `Remove Layer "${layer.name}"`;
  }

  redo(): void {
    this.remove();
  }
  undo(): void {
    this.add();
  }
}
