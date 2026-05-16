// Type-dispatch helper that picks the correct EditableLayer subclass for a
// given raw Layer. Lives in its own file to avoid circular imports between
// EditableLayer subclasses and EditableMap / EditableGroupLayer.

import { type Layer, LayerTypeFlag } from '@tiled-ts/core';

import { EditableLayer } from './editableLayer.js';
import { EditableTileLayer } from './editableTileLayer.js';
import { EditableImageLayer } from './editableImageLayer.js';
import { EditableObjectGroup } from './editableObjectGroup.js';
import { EditableGroupLayer } from './editableGroupLayer.js';

export function wrapLayer(layer: Layer): EditableLayer {
  switch (layer.layerType) {
    case LayerTypeFlag.TileLayerType:
      return new EditableTileLayer(layer as never);
    case LayerTypeFlag.ObjectGroupType:
      return new EditableObjectGroup(layer as never);
    case LayerTypeFlag.ImageLayerType:
      return new EditableImageLayer(layer as never);
    case LayerTypeFlag.GroupLayerType:
      return new EditableGroupLayer(layer as never);
    default:
      return new EditableLayer(layer);
  }
}
