// Port of libtiled/objecttemplate.h+cpp.
//
// `save()` and on-disk reading live in `@tiled-ts/format`. This file owns the
// in-memory shape and the tileset back-reference.

import type { MapObject } from './mapobject.js';
import type { Tileset } from './tileset.js';

export class ObjectTemplate {
  private _fileName = '';
  private _format = '';
  /** @internal */ object: MapObject | undefined = undefined;
  /** @internal */ tileset: Tileset | undefined = undefined;
  lastSaved = 0;

  constructor(fileName = '') {
    this._fileName = fileName;
  }

  get fileName(): string {
    return this._fileName;
  }
  setFileName(s: string): void {
    this._fileName = s;
  }
  get format(): string {
    return this._format;
  }
  setFormat(s: string): void {
    this._format = s;
  }

  setObject(o: MapObject | undefined): void {
    this.object = o;
    this.tileset = o?.cell.tileset ?? undefined;
  }
}
