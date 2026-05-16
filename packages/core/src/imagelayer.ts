// Port of libtiled/imagelayer.h+cpp.

import { Layer, LayerTypeFlag } from './layer.js';
import type { ColorString } from './types.js';
import { type ImageReference, makeImageReference } from './imageReference.js';
import type { Tileset } from './tileset.js';

export enum RepetitionFlag {
  RepeatX = 0x1,
  RepeatY = 0x2,
}

export class ImageLayer extends Layer {
  imageSource = '';
  transparentColor: ColorString | undefined = undefined;
  imageReference: ImageReference = makeImageReference();
  repetition = 0;

  constructor(name = '', x = 0, y = 0) {
    super(LayerTypeFlag.ImageLayerType, name, x, y);
  }

  resetImage(): void {
    this.imageReference = makeImageReference();
  }

  get repeatX(): boolean {
    return Boolean(this.repetition & RepetitionFlag.RepeatX);
  }
  setRepeatX(v: boolean): void {
    this.repetition = v ? this.repetition | RepetitionFlag.RepeatX : this.repetition & ~RepetitionFlag.RepeatX;
  }
  get repeatY(): boolean {
    return Boolean(this.repetition & RepetitionFlag.RepeatY);
  }
  setRepeatY(v: boolean): void {
    this.repetition = v ? this.repetition | RepetitionFlag.RepeatY : this.repetition & ~RepetitionFlag.RepeatY;
  }

  /* ─── Layer overrides ─── */

  override isEmpty(): boolean {
    return this.imageSource.length === 0;
  }
  override usedTilesets(): Set<Tileset> {
    return new Set();
  }
  override referencesTileset(_tileset: Tileset): boolean {
    return false;
  }
  override replaceReferencesToTileset(_oldTileset: Tileset, _newTileset: Tileset): void {
    /* image layers don't reference tiles */
  }
  override canMergeWith(_other: Layer): boolean {
    return false;
  }
  override mergedWith(_other: Layer): Layer {
    throw new Error('ImageLayer cannot merge with other layers');
  }
  override clone(): ImageLayer {
    const c = new ImageLayer(this.name, this.x, this.y);
    this.initializeClone(c);
    c.imageSource = this.imageSource;
    c.transparentColor = this.transparentColor;
    c.imageReference = { ...this.imageReference };
    c.repetition = this.repetition;
    return c;
  }
}
