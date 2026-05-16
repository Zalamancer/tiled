// Hit-testing utility for map objects.
//
// Returns every object whose visual bounds contain `pos` (in pixel
// coordinates of the same space as `obj.position`). The list is ordered from
// topmost (last child) to bottom.

import {
  type MapObject,
  MapObjectShape,
  type ObjectGroup,
  type Point,
  type Rect,
} from '@tiled-ts/core';

export function objectsAt(group: ObjectGroup, pos: Point): MapObject[] {
  const out: MapObject[] = [];
  for (let i = group.objectCount() - 1; i >= 0; i--) {
    const obj = group.objectAt(i);
    if (!obj || !obj.visible) continue;
    if (hitTest(obj, pos)) out.push(obj);
  }
  return out;
}

export function topMostObjectAt(group: ObjectGroup, pos: Point): MapObject | undefined {
  return objectsAt(group, pos)[0];
}

export function hitTest(obj: MapObject, pos: Point): boolean {
  // Translate hit-point into object-local coords (no rotation handling for
  // first pass — Tiled's rotated-object hit-test also approximates).
  const local: Point = { x: pos.x - obj.x, y: pos.y - obj.y };

  switch (obj.shape) {
    case MapObjectShape.Rectangle:
    case MapObjectShape.Capsule:
      return inRect(local, { x: 0, y: 0, width: obj.width, height: obj.height });
    case MapObjectShape.Ellipse:
      return inEllipse(local, obj.width, obj.height);
    case MapObjectShape.Point:
      return local.x * local.x + local.y * local.y <= 16; // 4-px radius
    case MapObjectShape.Polygon:
      return pointInPolygon(local, obj.polygon, true);
    case MapObjectShape.Polyline:
      return distanceToPolyline(local, obj.polygon) <= 4;
    case MapObjectShape.Text:
      return inRect(local, { x: 0, y: 0, width: obj.width, height: obj.height });
  }
}

function inRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

function inEllipse(p: Point, w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  const cx = w / 2;
  const cy = h / 2;
  const dx = (p.x - cx) / cx;
  const dy = (p.y - cy) / cy;
  return dx * dx + dy * dy <= 1;
}

function pointInPolygon(p: Point, poly: readonly Point[], closed: boolean): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersects =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  if (closed) return inside;
  return inside; // polygons treat themselves as filled; polyline uses distance instead
}

function distanceToPolyline(p: Point, poly: readonly Point[]): number {
  if (poly.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = distanceToSegment(p, poly[i]!, poly[i + 1]!);
    if (d < min) min = d;
  }
  return min;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
