// Port of src/tiled/changewangsetdata.{h,cpp} and changetilewangid.{h,cpp}.

import { type Tileset, WangId, type WangSet, WangSetType } from '@tiled-ts/core';

import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

abstract class ChangeWangSetCommand<V> implements UndoCommand {
  abstract id: number;
  abstract text: string;
  protected oldValue!: V;

  constructor(
    protected readonly doc: MapDocument,
    protected readonly tileset: Tileset,
    protected readonly wangSet: WangSet,
    protected newValue: V,
  ) {}

  protected abstract read(w: WangSet): V;
  protected abstract write(w: WangSet, v: V): void;

  redo(): void {
    this.oldValue = this.read(this.wangSet);
    this.write(this.wangSet, this.newValue);
    this.fire();
  }
  undo(): void {
    this.write(this.wangSet, this.oldValue);
    this.fire();
  }
  protected fire(): void {
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
  mergeWith(other: UndoCommand): boolean {
    const o = other as ChangeWangSetCommand<V>;
    if (o.wangSet !== this.wangSet || o.id !== this.id) return false;
    this.newValue = o.newValue;
    return true;
  }
}

export class SetWangSetName extends ChangeWangSetCommand<string> {
  id = UndoCommandId.ChangeWangSetName;
  text = 'Rename WangSet';
  protected read(w: WangSet): string { return w.name; }
  protected write(w: WangSet, v: string): void { w.name = v; }
}

export class SetWangSetType extends ChangeWangSetCommand<WangSetType> {
  id = UndoCommandId.ChangeWangSetName + 1;
  text = 'Change WangSet Type';
  protected read(w: WangSet): WangSetType { return w.type; }
  protected write(w: WangSet, v: WangSetType): void { w.setType(v); }
}

export class SetWangSetColorCount extends ChangeWangSetCommand<number> {
  id = UndoCommandId.ChangeWangSetName + 2;
  text = 'Change WangSet Colors';
  protected read(w: WangSet): number { return w.colorCount(); }
  protected write(w: WangSet, v: number): void { w.setColorCount(v); }
}

/* ─────────────── add/remove WangSet ─────────────── */

export class AddWangSet implements UndoCommand {
  text: string;
  constructor(
    private readonly doc: MapDocument,
    private readonly tileset: Tileset,
    private readonly wangSet: WangSet,
    private readonly index?: number,
  ) {
    this.text = `Add WangSet "${wangSet.name}"`;
  }
  redo(): void {
    if (this.index === undefined) this.tileset.addWangSet(this.wangSet);
    else this.tileset.insertWangSet(this.index, this.wangSet);
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
  undo(): void {
    const i = this.tileset.wangSets.indexOf(this.wangSet);
    if (i >= 0) this.tileset.takeWangSetAt(i);
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
}

export class RemoveWangSet implements UndoCommand {
  text: string;
  private index: number;
  constructor(
    private readonly doc: MapDocument,
    private readonly tileset: Tileset,
    private readonly wangSet: WangSet,
  ) {
    this.index = tileset.wangSets.indexOf(wangSet);
    if (this.index < 0) throw new Error('wang set not in tileset');
    this.text = `Remove WangSet "${wangSet.name}"`;
  }
  redo(): void {
    this.tileset.takeWangSetAt(this.index);
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
  undo(): void {
    this.tileset.insertWangSet(this.index, this.wangSet);
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
}

/* ─────────────── per-tile WangId ─────────────── */

export class SetTileWangId implements UndoCommand {
  readonly id = UndoCommandId.ChangeTileWangId;
  text = 'Set Tile WangId';
  private oldId: WangId | undefined;

  constructor(
    private readonly doc: MapDocument,
    private readonly tileset: Tileset,
    private readonly wangSet: WangSet,
    private readonly tileId: number,
    private newId: WangId,
  ) {}

  redo(): void {
    this.oldId = this.wangSet.wangIdByTileId().get(this.tileId);
    this.wangSet.setWangId(this.tileId, this.newId);
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
  undo(): void {
    if (this.oldId) this.wangSet.setWangId(this.tileId, this.oldId);
    else this.wangSet.removeTileId(this.tileId);
    this.doc.emit({ kind: 'wangset-changed', tileset: this.tileset, wangSet: this.wangSet });
  }
  mergeWith(other: UndoCommand): boolean {
    const o = other as SetTileWangId;
    if (o.wangSet !== this.wangSet || o.tileId !== this.tileId) return false;
    this.newId = o.newId;
    return true;
  }
}
