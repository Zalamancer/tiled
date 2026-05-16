// Port of src/tiled/abstractobjecttool.{h,cpp} — TS subset.
//
// Provides convenience accessors and a small `currentObjectGroup()` helper
// that concrete object tools layer on top of `Tool`.

import type { Layer, MapObject, ObjectGroup, Point } from '@tiled-ts/core';
import { Tool, type ToolContext } from '../tool.js';
import { objectsAt, topMostObjectAt } from './objectHitTest.js';

export abstract class AbstractObjectTool extends Tool {
  protected currentObjectGroup(): ObjectGroup | undefined {
    const layer = this.ctx?.currentLayer();
    if (!layer) return undefined;
    return layer.isObjectGroup() ? (layer as ObjectGroup) : undefined;
  }

  protected mapObjectsAt(pos: Point): MapObject[] {
    const og = this.currentObjectGroup();
    return og ? objectsAt(og, pos) : [];
  }

  protected topMostMapObjectAt(pos: Point): MapObject | undefined {
    const og = this.currentObjectGroup();
    return og ? topMostObjectAt(og, pos) : undefined;
  }

  /** Convenience: ensure the active layer is an ObjectGroup. */
  protected requireObjectGroup(): ObjectGroup {
    const og = this.currentObjectGroup();
    if (!og) throw new Error(`${this.name}: current layer is not an object group`);
    return og;
  }

  /** Forwards `Layer.isObjectGroup` for tests that want the bare check. */
  static layerIsObjectGroup(layer: Layer | undefined): boolean {
    return !!layer?.isObjectGroup();
  }

  protected ctxOrThrow(): ToolContext {
    return this.requireCtx();
  }
}
