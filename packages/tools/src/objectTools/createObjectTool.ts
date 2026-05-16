// Port of src/tiled/createobjecttool.{h,cpp} — abstract base for the
// shape-creation tools (rectangle, ellipse, point, polygon, polyline, tile).
//
// State machine:
//
//        idle ─ press ─▶ creating ─ release ─▶ idle
//                   │              │
//                   │              └─ esc / right-click ─▶ cancel
//                   └─ outside object layer ─▶ ignore
//
// Concrete subclasses just override `instantiate(start)`, `updateOnDrag(end)`
// and `finish()`. The base handles state, undo wiring and preview cleanup.

import type { MapObject, Point } from '@tiled-ts/core';
import { AddMapObjects } from '@tiled-ts/commands';

import { AbstractObjectTool } from './abstractObjectTool.js';
import type { ToolPointerEvent, ToolPreview } from '../tool.js';
import type { TileRegion } from '@tiled-ts/core';

export abstract class CreateObjectTool extends AbstractObjectTool {
  protected previewObject: MapObject | null = null;
  protected creating = false;
  protected start: Point = { x: 0, y: 0 };

  /** Called on pointer-down to allocate the in-progress object. */
  protected abstract instantiate(at: Point): MapObject;
  /** Called on every pointer-move while `creating === true`. */
  protected abstract updateOnDrag(at: Point): void;

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button === 'right') {
      if (this.creating) this.cancel();
      return;
    }
    if (e.button !== 'left') return;
    if (!this.currentObjectGroup()) return;

    this.start = e.position;
    this.previewObject = this.instantiate(e.position);
    this.creating = true;
    this.requireCtx().invalidate();
  }

  override pointerMove(e: ToolPointerEvent): void {
    if (!this.creating) return;
    this.updateOnDrag(e.position);
    this.requireCtx().invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.creating || e.button !== 'left') return;
    this.finish();
  }

  override keyDown(key: string): boolean {
    if (this.creating && key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  override preview(): ToolPreview | null {
    return null; // object tools don't paint tile-grid previews
  }

  protected cancel(): void {
    this.creating = false;
    this.previewObject = null;
    this.requireCtx().invalidate();
  }

  protected finish(): void {
    if (!this.previewObject) return;
    const ctx = this.requireCtx();
    const group = this.requireObjectGroup();
    const obj = this.previewObject;
    this.previewObject = null;
    this.creating = false;
    ctx.push(new AddMapObjects(ctx.doc, group, [obj]));
    ctx.doc.selectedObjects.clear();
    ctx.doc.selectedObjects.add(obj);
    ctx.invalidate();
  }

  /** Suppresses unused-import warnings. */
  static _unused?: TileRegion;
}
