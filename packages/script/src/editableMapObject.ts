// Wrapper around `MapObject`. Mirrors EditableMapObject from
// src/tiled/editablemapobject.h.
//
// Direct field writes mutate the raw object so the typical "create-then-fill"
// pattern works without an active document:
//
//     const obj = new EditableMapObject('door');
//     obj.x = 10;
//     map.addObject(group, obj);            // wraps in an undo command
//
// Once `addObject` runs and the document is active, every subsequent setter
// goes through a `SetObject*` undo command so the change shows up in the undo
// stack.

import {
  MapObject,
  MapObjectShape,
  type ObjectGroup,
  type Point,
  type Size,
} from '@tiled-ts/core';
import {
  SetObjectName,
  SetObjectPosition,
  SetObjectRotation,
  SetObjectShape,
  SetObjectSize,
  SetObjectVisible,
  type MapDocument,
} from '@tiled-ts/commands';

import type { ScriptHost } from './scriptHost.js';

export class EditableMapObject {
  /** The wrapped data-model object. */
  readonly raw: MapObject;
  /** @internal — set on the wrapper by `ScriptHost` so setters can find the doc. */
  host: ScriptHost | undefined;

  constructor(raw: MapObject | string = '', className = '') {
    if (raw instanceof MapObject) {
      this.raw = raw;
    } else {
      this.raw = new MapObject(raw, className);
    }
  }

  /* ─── identity ─── */
  get id(): number {
    return this.raw.id;
  }
  get name(): string {
    return this.raw.name;
  }
  set name(v: string) {
    this.push((doc) => new SetObjectName(doc, this.raw, v), () => this.raw.setName(v));
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
  get shape(): MapObjectShape {
    return this.raw.shape;
  }
  set shape(v: MapObjectShape) {
    this.push((doc) => new SetObjectShape(doc, this.raw, v), () => this.raw.setShape(v));
  }
  get layer(): ObjectGroup | undefined {
    return this.raw.objectGroup;
  }

  /* ─── geometry ─── */
  get x(): number {
    return this.raw.x;
  }
  set x(v: number) {
    this.setPos({ x: v, y: this.raw.y });
  }
  get y(): number {
    return this.raw.y;
  }
  set y(v: number) {
    this.setPos({ x: this.raw.x, y: v });
  }
  get pos(): Point {
    return this.raw.position;
  }
  set pos(v: Point) {
    this.setPos({ x: v.x, y: v.y });
  }
  get width(): number {
    return this.raw.width;
  }
  set width(v: number) {
    this.setSize({ width: v, height: this.raw.height });
  }
  get height(): number {
    return this.raw.height;
  }
  set height(v: number) {
    this.setSize({ width: this.raw.width, height: v });
  }
  get size(): Size {
    return this.raw.size;
  }
  set size(v: Size) {
    this.setSize({ width: v.width, height: v.height });
  }
  get rotation(): number {
    return this.raw.rotation;
  }
  set rotation(v: number) {
    this.push((doc) => new SetObjectRotation(doc, this.raw, v), () => {
      this.raw.rotation = v;
    });
  }
  get visible(): boolean {
    return this.raw.visible;
  }
  set visible(v: boolean) {
    this.push((doc) => new SetObjectVisible(doc, this.raw, v), () => {
      this.raw.visible = v;
    });
  }

  /* ─── helpers ─── */
  private setPos(p: Point): void {
    this.push(
      (doc) => new SetObjectPosition(doc, this.raw, p),
      () => this.raw.setPosition(p),
    );
  }
  private setSize(s: Size): void {
    this.push(
      (doc) => new SetObjectSize(doc, this.raw, s),
      () => this.raw.setSize(s),
    );
  }

  /** Run `direct` when no document is active, push an undo command otherwise. */
  private push(makeCommand: (doc: MapDocument) => import('@tiled-ts/commands').UndoCommand, direct: () => void): void {
    const doc = this.host?.activeDocument();
    if (doc) {
      doc.undoStack.push(makeCommand(doc));
    } else {
      direct();
    }
  }
}
