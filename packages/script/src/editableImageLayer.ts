// Wrapper around `ImageLayer`. Mirrors EditableImageLayer from
// src/tiled/editableimagelayer.h.

import { ImageLayer, type ColorString } from '@tiled-ts/core';

import { EditableLayer } from './editableLayer.js';

export class EditableImageLayer extends EditableLayer {
  override readonly raw: ImageLayer;

  constructor(raw: ImageLayer | string = '') {
    const il = raw instanceof ImageLayer ? raw : new ImageLayer(raw);
    super(il);
    this.raw = il;
  }

  get imageSource(): string {
    return this.raw.imageSource;
  }
  set imageSource(v: string) {
    this.raw.imageSource = v;
  }
  get transparentColor(): ColorString | undefined {
    return this.raw.transparentColor;
  }
  set transparentColor(v: ColorString | undefined) {
    this.raw.transparentColor = v;
  }
  get repeatX(): boolean {
    return this.raw.repeatX;
  }
  set repeatX(v: boolean) {
    this.raw.setRepeatX(v);
  }
  get repeatY(): boolean {
    return this.raw.repeatY;
  }
  set repeatY(v: boolean) {
    this.raw.setRepeatY(v);
  }
}
