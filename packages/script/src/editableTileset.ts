// Wrapper around `Tileset`. Mirrors EditableTileset from
// src/tiled/editabletileset.h.

import type { Tileset } from '@tiled-ts/core';

import { EditableTile } from './editableTile.js';

export class EditableTileset {
  constructor(public readonly raw: Tileset) {}

  get name(): string {
    return this.raw.name;
  }
  set name(v: string) {
    this.raw.setName(v);
  }
  get fileName(): string {
    return this.raw.fileName;
  }
  get tileWidth(): number {
    return this.raw.tileWidth;
  }
  get tileHeight(): number {
    return this.raw.tileHeight;
  }
  get tileCount(): number {
    return this.raw.tileCount;
  }
  get image(): string {
    return this.raw.imageReference.source ?? '';
  }
  get className(): string {
    return this.raw.className;
  }
  set className(v: string) {
    this.raw.setClassName(v);
  }

  tile(id: number): EditableTile | undefined {
    const t = this.raw.findTile(id);
    return t ? new EditableTile(t) : undefined;
  }

  tiles(): EditableTile[] {
    return Array.from(this.raw.tiles, (t) => new EditableTile(t));
  }
}
