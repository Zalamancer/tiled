// Port of src/tiled/createellipseobjecttool.{h,cpp}.

import { MapObject, MapObjectShape, type Point } from '@tiled-ts/core';
import { CreateObjectTool } from './createObjectTool.js';

export class CreateEllipseObjectTool extends CreateObjectTool {
  constructor() {
    super('CreateEllipseObject', 'Insert Ellipse');
  }

  protected instantiate(at: Point): MapObject {
    const obj = new MapObject('', '', { x: at.x, y: at.y }, { width: 0, height: 0 });
    obj.setShape(MapObjectShape.Ellipse);
    return obj;
  }

  protected updateOnDrag(at: Point): void {
    if (!this.previewObject) return;
    const x1 = Math.min(this.start.x, at.x);
    const y1 = Math.min(this.start.y, at.y);
    const x2 = Math.max(this.start.x, at.x);
    const y2 = Math.max(this.start.y, at.y);
    this.previewObject.setPosition({ x: x1, y: y1 });
    this.previewObject.setSize({ width: x2 - x1, height: y2 - y1 });
  }
}
