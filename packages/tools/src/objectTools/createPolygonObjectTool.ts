// Port of src/tiled/createpolygonobjecttool.{h,cpp} + createpolylineobjecttool.
//
// Lifecycle:
//   - First click sets the anchor and seeds the first vertex.
//   - Every subsequent click appends a vertex.
//   - Double-click / Enter / right-click finishes the object.
//   - Escape cancels (no object created).

import { MapObject, MapObjectShape, type Point } from '@tiled-ts/core';
import { AddMapObjects } from '@tiled-ts/commands';
import { AbstractObjectTool } from './abstractObjectTool.js';
import type { ToolPointerEvent, ToolPreview } from '../tool.js';

export type PolyMode = 'polygon' | 'polyline';

export class CreatePolygonObjectTool extends AbstractObjectTool {
  private inProgress = false;
  private anchor: Point = { x: 0, y: 0 };
  private points: Point[] = [];
  private hoverPos: Point = { x: 0, y: 0 };

  constructor(public mode: PolyMode = 'polygon') {
    super(
      mode === 'polygon' ? 'CreatePolygonObject' : 'CreatePolylineObject',
      mode === 'polygon' ? 'Insert Polygon' : 'Insert Polyline',
    );
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button === 'right') {
      if (this.inProgress) this.finish();
      return;
    }
    if (e.button !== 'left') return;
    const og = this.currentObjectGroup();
    if (!og) return;

    if (!this.inProgress) {
      this.inProgress = true;
      this.anchor = e.position;
      this.points = [{ x: 0, y: 0 }];
    } else {
      // Append a new vertex relative to the anchor.
      this.points.push({ x: e.position.x - this.anchor.x, y: e.position.y - this.anchor.y });
    }
    this.requireCtx().invalidate();
  }

  override pointerMove(e: ToolPointerEvent): void {
    if (!this.inProgress) return;
    this.hoverPos = e.position;
    this.requireCtx().invalidate();
  }

  override keyDown(key: string): boolean {
    if (!this.inProgress) return false;
    if (key === 'Escape') {
      this.cancel();
      return true;
    }
    if (key === 'Enter' || key === 'Return') {
      this.finish();
      return true;
    }
    return false;
  }

  /** Preview vertices in anchor-relative coordinates (callers translate). */
  previewPoints(): { anchor: Point; points: Point[]; hover: Point } | null {
    if (!this.inProgress) return null;
    return {
      anchor: this.anchor,
      points: this.points,
      hover: { x: this.hoverPos.x - this.anchor.x, y: this.hoverPos.y - this.anchor.y },
    };
  }

  override preview(): ToolPreview | null {
    return null;
  }

  private cancel(): void {
    this.inProgress = false;
    this.points = [];
    this.requireCtx().invalidate();
  }

  private finish(): void {
    if (this.points.length < 2) {
      this.cancel();
      return;
    }
    const ctx = this.requireCtx();
    const og = this.requireObjectGroup();
    const obj = new MapObject('', '', { x: this.anchor.x, y: this.anchor.y }, { width: 0, height: 0 });
    obj.setShape(this.mode === 'polygon' ? MapObjectShape.Polygon : MapObjectShape.Polyline);
    obj.setPolygon(this.points.map((p) => ({ x: p.x, y: p.y })));
    ctx.push(new AddMapObjects(ctx.doc, og, [obj]));
    ctx.doc.selectedObjects.clear();
    ctx.doc.selectedObjects.add(obj);
    this.inProgress = false;
    this.points = [];
    ctx.invalidate();
  }
}

export class CreatePolylineObjectTool extends CreatePolygonObjectTool {
  constructor() {
    super('polyline');
  }
}
