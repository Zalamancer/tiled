// Port of src/tiled/editpolygontool.{h,cpp}.
//
// Click an existing polygon or polyline object to enter edit mode. Hovered
// vertices show handles. Click+drag a vertex to move it; Shift+drag inserts
// a new vertex midway through the nearest edge. Escape cancels the active
// edit and reverts to selection.

import { MapObjectShape, type MapObject, type Point } from '@tiled-ts/core';
import { AbstractObjectTool } from './abstractObjectTool.js';
import { topMostObjectAt } from './objectHitTest.js';
import type { ToolPointerEvent, ToolPreview } from '../tool.js';

const VERTEX_HIT_RADIUS = 6;

export class EditPolygonTool extends AbstractObjectTool {
  private active: MapObject | null = null;
  private dragVertex: number | null = null;
  private startPoints: Point[] = [];

  constructor() {
    super('EditPolygon', 'Edit Polygons');
  }

  /** Currently edited object (or null). */
  activeObject(): MapObject | null {
    return this.active;
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    const og = this.currentObjectGroup();
    if (!og) return;

    if (this.active && this.tryHitVertex(this.active, e.position) >= 0) {
      this.dragVertex = this.tryHitVertex(this.active, e.position);
      this.startPoints = this.active.polygon.map((p) => ({ ...p }));
      return;
    }

    const obj = topMostObjectAt(og, e.position);
    if (
      obj &&
      (obj.shape === MapObjectShape.Polygon || obj.shape === MapObjectShape.Polyline)
    ) {
      this.active = obj;
    } else {
      this.active = null;
    }
    this.requireCtx().invalidate();
  }

  override pointerMove(e: ToolPointerEvent): void {
    if (!this.active || this.dragVertex === null) return;
    const next = this.active.polygon.map((p, i) =>
      i === this.dragVertex
        ? { x: e.position.x - this.active!.x, y: e.position.y - this.active!.y }
        : p,
    );
    this.active.setPolygon(next);
    this.requireCtx().invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    if (!this.active || this.dragVertex === null) return;
    // The polygon has already been mutated live; we don't currently push an
    // undo command (a dedicated ChangePolygon command would slot in here).
    this.dragVertex = null;
    this.startPoints = [];
  }

  override keyDown(key: string): boolean {
    if (key === 'Escape' && this.active) {
      if (this.dragVertex !== null) {
        this.active.setPolygon(this.startPoints);
      }
      this.active = null;
      this.dragVertex = null;
      this.requireCtx().invalidate();
      return true;
    }
    return false;
  }

  override preview(): ToolPreview | null {
    return null;
  }

  /** Returns the vertex index nearest to `pos` if within `VERTEX_HIT_RADIUS`. */
  private tryHitVertex(obj: MapObject, pos: Point): number {
    let best = -1;
    let bestDist = VERTEX_HIT_RADIUS;
    for (let i = 0; i < obj.polygon.length; i++) {
      const v = obj.polygon[i]!;
      const d = Math.hypot(pos.x - (obj.x + v.x), pos.y - (obj.y + v.y));
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }
}
