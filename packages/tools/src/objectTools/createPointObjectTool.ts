// Port of src/tiled/createpointobjecttool.{h,cpp} — single click creates a
// point at the exact pixel position.

import { MapObject, MapObjectShape, type Point } from '@tiled-ts/core';
import { AddMapObjects } from '@tiled-ts/commands';
import { AbstractObjectTool } from './abstractObjectTool.js';
import type { ToolPointerEvent, ToolPreview } from '../tool.js';

export class CreatePointObjectTool extends AbstractObjectTool {
  constructor() {
    super('CreatePointObject', 'Insert Point');
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    const og = this.currentObjectGroup();
    if (!og) return;
    const obj = new MapObject('', '', { x: e.position.x, y: e.position.y }, { width: 0, height: 0 });
    obj.setShape(MapObjectShape.Point);
    const ctx = this.requireCtx();
    ctx.push(new AddMapObjects(ctx.doc, og, [obj]));
    ctx.doc.selectedObjects.clear();
    ctx.doc.selectedObjects.add(obj);
    ctx.invalidate();
  }

  override preview(): ToolPreview | null {
    return null;
  }

  // Re-export Point so tree-shakers don't drop the imported type signature.
  static _p?: Point;
}
