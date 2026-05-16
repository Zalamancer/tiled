// Editor-side document wrapping a `Map`. Equivalent to libtiled's MapDocument
// minus the QObject signal plumbing. Owns the undo stack, emits change events,
// and tracks editor-local state (selected layer index, current object set).

import type { Layer, Map as TiledMap, MapObject } from '@tiled-ts/core';
import { UndoStack } from './undoStack.js';
import type { ChangeEvent, ChangeEventListener } from './events.js';

export class MapDocument {
  readonly map: TiledMap;
  readonly undoStack = new UndoStack();
  private listeners = new Set<ChangeEventListener>();

  /** Index of the currently selected layer in the map's flat layer list. */
  currentLayerIndex = 0;

  selectedObjects: Set<MapObject> = new Set();

  constructor(map: TiledMap) {
    this.map = map;
  }

  /** Currently selected layer (or undefined when no layer exists). */
  currentLayer(): Layer | undefined {
    return this.map.layerAt(this.currentLayerIndex);
  }

  setCurrentLayer(layer: Layer | undefined): void {
    if (!layer) {
      this.currentLayerIndex = -1;
      return;
    }
    const i = this.map.layers.indexOf(layer);
    if (i >= 0) this.currentLayerIndex = i;
  }

  subscribe(listener: ChangeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ChangeEvent): void {
    for (const l of this.listeners) l(event);
  }
}
