// Wrapper around `Tile` exposing the subset used by scripts. Mirrors
// EditableTile from src/tiled/editabletile.h, minus the per-tile-objectgroup
// editor (which isn't ported in @tiled-ts/core yet).

import type { Tile, Tileset } from '@tiled-ts/core';

export class EditableTile {
  constructor(public readonly raw: Tile) {}

  get id(): number {
    return this.raw.id;
  }
  get tileset(): Tileset {
    return this.raw.tileset;
  }
  get type(): string {
    return this.raw.className;
  }
  set type(v: string) {
    this.raw.setClassName(v);
  }
  get className(): string {
    return this.raw.className;
  }
  set className(v: string) {
    this.raw.setClassName(v);
  }
  get imageSource(): string {
    return this.raw.imageSource;
  }
  get width(): number {
    return this.raw.width;
  }
  get height(): number {
    return this.raw.height;
  }
  get probability(): number {
    return this.raw.probability;
  }
  set probability(v: number) {
    this.raw.probability = v;
  }
}
