// Port of libtiled/objectgroup.h+cpp.

import { Layer, LayerTypeFlag } from './layer.js';
import type { ColorString, Point, Rect } from './types.js';
import { type MapObject } from './mapobject.js';
import type { Tileset } from './tileset.js';

export enum ObjectGroupDrawOrder {
  UnknownOrder = -1,
  TopDownOrder = 0,
  IndexOrder = 1,
}

export class ObjectGroup extends Layer {
  private _objects: MapObject[] = [];
  color: ColorString | undefined = undefined;
  drawOrder: ObjectGroupDrawOrder = ObjectGroupDrawOrder.TopDownOrder;

  constructor(name = '', x = 0, y = 0) {
    super(LayerTypeFlag.ObjectGroupType, name, x, y);
  }

  get objects(): readonly MapObject[] {
    return this._objects;
  }
  objectCount(): number {
    return this._objects.length;
  }
  objectAt(i: number): MapObject | undefined {
    return this._objects[i];
  }

  addObject(o: MapObject): void {
    o.objectGroup = this;
    this._objects.push(o);
  }

  insertObject(index: number, o: MapObject): void {
    o.objectGroup = this;
    this._objects.splice(index, 0, o);
  }

  removeObject(o: MapObject): number {
    const i = this._objects.indexOf(o);
    if (i >= 0) {
      this._objects.splice(i, 1);
      o.objectGroup = undefined;
    }
    return i;
  }

  removeObjectAt(i: number): MapObject | undefined {
    const [removed] = this._objects.splice(i, 1);
    if (removed) removed.objectGroup = undefined;
    return removed;
  }

  moveObjects(from: number, to: number, count: number): void {
    if (count <= 0 || from === to) return;
    const removed = this._objects.splice(from, count);
    const insertAt = to > from ? to - count : to;
    this._objects.splice(insertAt, 0, ...removed);
  }

  /** Bounding rect (in pixels) around all contained objects. */
  objectsBoundingRect(): Rect {
    if (this._objects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const o of this._objects) {
      const b = o.bounds();
      if (b.x < x1) x1 = b.x;
      if (b.y < y1) y1 = b.y;
      if (b.x + b.width > x2) x2 = b.x + b.width;
      if (b.y + b.height > y2) y2 = b.y + b.height;
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  highestObjectId(): number {
    let max = 0;
    for (const o of this._objects) if (o.id > max) max = o.id;
    return max;
  }

  /* ─── Layer overrides ─── */

  override isEmpty(): boolean {
    return this._objects.length === 0;
  }

  override usedTilesets(): Set<Tileset> {
    const out = new Set<Tileset>();
    for (const o of this._objects) {
      const ts = o.cell.tileset;
      if (ts) out.add(ts);
    }
    return out;
  }

  override referencesTileset(tileset: Tileset): boolean {
    for (const o of this._objects) if (o.cell.tileset === tileset) return true;
    return false;
  }

  override replaceReferencesToTileset(oldTileset: Tileset, newTileset: Tileset): void {
    for (const o of this._objects) {
      if (o.cell.tileset === oldTileset) o.cell.setTile(newTileset, o.cell.tileId);
    }
  }

  override canMergeWith(other: Layer): boolean {
    return other.isObjectGroup();
  }

  override mergedWith(other: Layer): Layer {
    const merged = this.clone();
    if (other.isObjectGroup()) {
      for (const o of (other as ObjectGroup)._objects) merged.addObject(o.clone());
    }
    return merged;
  }

  /** Pixel-space offset of every contained object, optionally with wrapping. */
  offsetObjects(offset: Point, bounds: Rect, _wholeMap: boolean, wrapX: boolean, wrapY: boolean): void {
    for (const o of this._objects) {
      let { x, y } = o.position;
      const cx = x + o.width / 2;
      const cy = y + o.height / 2;
      if (cx < bounds.x || cx >= bounds.x + bounds.width) continue;
      if (cy < bounds.y || cy >= bounds.y + bounds.height) continue;
      x += offset.x;
      y += offset.y;
      if (wrapX && bounds.width > 0) {
        const cxNew = x + o.width / 2;
        if (cxNew < bounds.x) x += bounds.width;
        else if (cxNew >= bounds.x + bounds.width) x -= bounds.width;
      }
      if (wrapY && bounds.height > 0) {
        const cyNew = y + o.height / 2;
        if (cyNew < bounds.y) y += bounds.height;
        else if (cyNew >= bounds.y + bounds.height) y -= bounds.height;
      }
      o.setPosition({ x, y });
    }
  }

  override clone(): ObjectGroup {
    const c = new ObjectGroup(this.name, this.x, this.y);
    this.initializeClone(c);
    c.color = this.color;
    c.drawOrder = this.drawOrder;
    for (const o of this._objects) c.addObject(o.clone());
    return c;
  }
}

export function drawOrderToString(d: ObjectGroupDrawOrder): string {
  return d === ObjectGroupDrawOrder.IndexOrder ? 'index' : 'topdown';
}

export function drawOrderFromString(s: string): ObjectGroupDrawOrder {
  if (s === 'index') return ObjectGroupDrawOrder.IndexOrder;
  if (s === 'topdown') return ObjectGroupDrawOrder.TopDownOrder;
  return ObjectGroupDrawOrder.UnknownOrder;
}
