// Port of src/tiled/addremovetileset.{h,cpp}.

import type { Tileset } from '@tiled-ts/core';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

export class AddTileset implements UndoCommand {
  text: string;
  private index: number;

  constructor(private readonly doc: MapDocument, private readonly tileset: Tileset, index?: number) {
    this.index = index ?? doc.map.tilesetCount();
    this.text = `Add Tileset "${tileset.name}"`;
  }

  redo(): void {
    this.doc.map.insertTileset(this.index, this.tileset);
    this.doc.emit({ kind: 'tilesets-changed', map: this.doc.map });
  }
  undo(): void {
    const i = this.doc.map.indexOfTileset(this.tileset);
    if (i >= 0) this.doc.map.removeTilesetAt(i);
    this.doc.emit({ kind: 'tilesets-changed', map: this.doc.map });
  }
}

export class RemoveTileset implements UndoCommand {
  text: string;
  private index: number;
  private tileset: Tileset;

  constructor(private readonly doc: MapDocument, tileset: Tileset) {
    const i = doc.map.indexOfTileset(tileset);
    if (i < 0) throw new Error(`tileset not in map: ${tileset.name}`);
    this.tileset = tileset;
    this.index = i;
    this.text = `Remove Tileset "${tileset.name}"`;
  }

  redo(): void {
    this.doc.map.removeTilesetAt(this.index);
    this.doc.emit({ kind: 'tilesets-changed', map: this.doc.map });
  }
  undo(): void {
    this.doc.map.insertTileset(this.index, this.tileset);
    this.doc.emit({ kind: 'tilesets-changed', map: this.doc.map });
  }
}

export class MoveTileset implements UndoCommand {
  text: string;
  constructor(
    private readonly doc: MapDocument,
    private readonly tileset: Tileset,
    private readonly toIndex: number,
  ) {
    this.text = `Move Tileset "${tileset.name}"`;
  }
  private fromIndex = -1;

  redo(): void {
    this.fromIndex = this.doc.map.indexOfTileset(this.tileset);
    if (this.fromIndex < 0) return;
    this.doc.map.removeTilesetAt(this.fromIndex);
    this.doc.map.insertTileset(this.toIndex, this.tileset);
    this.doc.emit({ kind: 'tilesets-changed', map: this.doc.map });
  }
  undo(): void {
    if (this.fromIndex < 0) return;
    const cur = this.doc.map.indexOfTileset(this.tileset);
    this.doc.map.removeTilesetAt(cur);
    this.doc.map.insertTileset(this.fromIndex, this.tileset);
    this.doc.emit({ kind: 'tilesets-changed', map: this.doc.map });
  }
}
