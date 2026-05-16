// Port of src/tiled/changeproperties.{h,cpp}.

import {
  cloneProperties,
  getPropertyMemberValue,
  pathToString,
  setPropertyMemberValue,
  type PropertyPath,
  type PropertyValue,
  type TiledObject,
} from '@tiled-ts/core';
import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

export class SetProperty implements UndoCommand {
  readonly id = UndoCommandId.SetProperty;
  text: string;
  private oldValue: PropertyValue | undefined;
  private existed = false;

  constructor(
    private readonly doc: MapDocument,
    private readonly target: TiledObject,
    private readonly name: string,
    private newValue: PropertyValue,
  ) {
    this.text = `Set "${name}"`;
  }

  redo(): void {
    this.oldValue = this.target.property(this.name);
    this.existed = this.target.hasProperty(this.name);
    this.target.setProperty(this.name, this.newValue);
    this.fire();
  }
  undo(): void {
    if (this.existed) this.target.setProperty(this.name, this.oldValue!);
    else this.target.removeProperty(this.name);
    this.fire();
  }
  mergeWith(other: UndoCommand): boolean {
    const o = other as SetProperty;
    if (o.target !== this.target || o.name !== this.name) return false;
    this.newValue = o.newValue;
    return true;
  }
  private fire(): void {
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }
}

export class RemoveProperty implements UndoCommand {
  text: string;
  private oldValue: PropertyValue | undefined;

  constructor(
    private readonly doc: MapDocument,
    private readonly target: TiledObject,
    private readonly name: string,
  ) {
    this.text = `Remove "${name}"`;
  }
  redo(): void {
    this.oldValue = this.target.property(this.name);
    this.target.removeProperty(this.name);
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }
  undo(): void {
    if (this.oldValue !== undefined) this.target.setProperty(this.name, this.oldValue);
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }
}

/**
 * Set a nested property at `path` (e.g. `['stats', 'health']` for a class
 * value). Snapshots the *entire* property bag on first redo so the undo
 * trivially restores prior structure.
 */
export class SetPropertyMember implements UndoCommand {
  readonly id = UndoCommandId.SetProperty;
  text: string;
  private oldSnapshot: ReturnType<typeof cloneProperties> | undefined;

  constructor(
    private readonly doc: MapDocument,
    private readonly target: TiledObject,
    private readonly path: PropertyPath,
    private newValue: PropertyValue,
  ) {
    this.text = `Set "${pathToString(path)}"`;
  }

  redo(): void {
    if (!this.oldSnapshot) this.oldSnapshot = cloneProperties(this.target.properties);
    setPropertyMemberValue(this.target.properties, this.path, this.newValue);
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }

  undo(): void {
    if (!this.oldSnapshot) return;
    this.target.setProperties(this.oldSnapshot);
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }

  mergeWith(other: UndoCommand): boolean {
    const o = other as SetPropertyMember;
    if (o.target !== this.target || o.path.length !== this.path.length) return false;
    for (let i = 0; i < this.path.length; i++) {
      if (this.path[i] !== o.path[i]) return false;
    }
    this.newValue = o.newValue;
    return true;
  }

  /** Suppresses an unused-import warning for `getPropertyMemberValue`. */
  static _unused = getPropertyMemberValue;
}

export class RenameProperty implements UndoCommand {
  text: string;
  constructor(
    private readonly doc: MapDocument,
    private readonly target: TiledObject,
    private readonly oldName: string,
    private readonly newName: string,
  ) {
    this.text = `Rename Property`;
  }
  redo(): void {
    const v = this.target.property(this.oldName);
    if (v === undefined) return;
    this.target.removeProperty(this.oldName);
    this.target.setProperty(this.newName, v);
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }
  undo(): void {
    const v = this.target.property(this.newName);
    if (v === undefined) return;
    this.target.removeProperty(this.newName);
    this.target.setProperty(this.oldName, v);
    this.doc.emit({ kind: 'properties-changed', target: this.target });
  }
}
