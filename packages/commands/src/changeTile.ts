// Port of src/tiled/changetile{animation,probability,objectgroup}.{h,cpp}.

import type { Frame, MapObject, ObjectGroup, Tile } from '@tiled-ts/core';
import { ObjectGroup as ObjectGroupClass } from '@tiled-ts/core';

import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

/** Replace the frame list of an animated tile. */
export class ChangeTileAnimation implements UndoCommand {
  text: string;
  private oldFrames: Frame[];

  constructor(
    private readonly doc: MapDocument,
    private readonly tile: Tile,
    private newFrames: Frame[],
  ) {
    this.oldFrames = tile.frames.map((f) => ({ ...f }));
    this.text = `Change Animation of Tile ${tile.id}`;
  }

  redo(): void {
    this.tile.setFrames(this.newFrames.map((f) => ({ ...f })));
    this.fire();
  }
  undo(): void {
    this.tile.setFrames(this.oldFrames.map((f) => ({ ...f })));
    this.fire();
  }
  private fire(): void {
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'animation' });
  }
}

/** Replace the per-tile probability (for stamp-brush random fill). */
export class ChangeTileProbability implements UndoCommand {
  readonly id = UndoCommandId.ChangeTileProbability;
  text: string;
  private oldValue!: number;

  constructor(
    private readonly doc: MapDocument,
    private readonly tile: Tile,
    private newValue: number,
  ) {
    this.text = `Change Tile ${tile.id} Probability`;
  }

  redo(): void {
    this.oldValue = this.tile.probability;
    this.tile.probability = this.newValue;
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'probability' });
  }
  undo(): void {
    this.tile.probability = this.oldValue;
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'probability' });
  }
  mergeWith(other: UndoCommand): boolean {
    const o = other as ChangeTileProbability;
    if (o.tile !== this.tile) return false;
    this.newValue = o.newValue;
    return true;
  }
}

/** Replace the `className` of a Tile (its `type` in upstream nomenclature). */
export class ChangeTileType implements UndoCommand {
  text: string;
  private oldValue!: string;

  constructor(
    private readonly doc: MapDocument,
    private readonly tile: Tile,
    private newValue: string,
  ) {
    this.text = `Change Tile ${tile.id} Class`;
  }
  redo(): void {
    this.oldValue = this.tile.className;
    this.tile.setClassName(this.newValue);
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'className' });
  }
  undo(): void {
    this.tile.setClassName(this.oldValue);
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'className' });
  }
}

/** Replace the tile's collision `ObjectGroup` wholesale. Passing `undefined`
 *  clears the collision data. */
export class ChangeTileObjectGroup implements UndoCommand {
  text: string;
  private oldGroup: ObjectGroup | undefined;

  constructor(
    private readonly doc: MapDocument,
    private readonly tile: Tile,
    private readonly newGroup: ObjectGroup | undefined,
  ) {
    this.text = `Change Tile ${tile.id} Collision`;
  }
  redo(): void {
    this.oldGroup = this.tile.objectGroup;
    this.tile.objectGroup = this.newGroup
      ? (this.newGroup.clone() as ObjectGroup)
      : undefined;
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'objectGroup' });
  }
  undo(): void {
    this.tile.objectGroup = this.oldGroup
      ? (this.oldGroup.clone() as ObjectGroup)
      : undefined;
    this.doc.emit({ kind: 'tile-changed', tile: this.tile, property: 'objectGroup' });
  }

  /** Used by the collision editor when inserting a new shape from scratch. */
  static newGroupFor(name: string): ObjectGroup {
    return new ObjectGroupClass(name);
  }
}

export type { MapObject };
