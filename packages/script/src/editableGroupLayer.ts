// Wrapper around `GroupLayer`. Mirrors EditableGroupLayer from
// src/tiled/editablegrouplayer.h.

import { GroupLayer } from '@tiled-ts/core';

import { EditableLayer } from './editableLayer.js';
import { wrapLayer } from './wrapLayer.js';

export class EditableGroupLayer extends EditableLayer {
  override readonly raw: GroupLayer;

  constructor(raw: GroupLayer | string = '') {
    const gl = raw instanceof GroupLayer ? raw : new GroupLayer(raw);
    super(gl);
    this.raw = gl;
  }

  get layerCount(): number {
    return this.raw.layerCount();
  }

  layerAt(index: number): EditableLayer | undefined {
    const l = this.raw.layerAt(index);
    if (!l) return undefined;
    const wrapped = wrapLayer(l);
    wrapped.host = this.host;
    return wrapped;
  }

  layers(): EditableLayer[] {
    return this.raw.layers.map((l) => {
      const wrapped = wrapLayer(l);
      wrapped.host = this.host;
      return wrapped;
    });
  }
}
