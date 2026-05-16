// Port of src/tiled/objectselectiontool.{h,cpp}.
//
// Click an object to select it (Shift = toggle, Ctrl = add). Drag a marquee
// in empty space to box-select. Drag a selected object to move it (and any
// other selected objects in lock-step). Moves are committed on pointer-up as
// one undo entry.

import type { MapObject, Point, Rect } from '@tiled-ts/core';
import { SetObjectPosition } from '@tiled-ts/commands';

import { AbstractObjectTool } from './abstractObjectTool.js';
import type { ModifierState, ToolPointerEvent } from '../tool.js';

interface DragSnapshot {
  obj: MapObject;
  startPos: Point;
}

export class ObjectSelectionTool extends AbstractObjectTool {
  private down = false;
  private mode: 'none' | 'marquee' | 'move' = 'none';
  private downAt: Point = { x: 0, y: 0 };
  private downAtTile: Point = { x: 0, y: 0 };
  private marquee: Rect | null = null;
  private dragSnapshots: DragSnapshot[] = [];

  constructor() {
    super('ObjectSelection', 'Object Selection');
  }

  /** Live marquee rect, in pixel coordinates of the map. */
  marqueeRect(): Rect | null {
    return this.marquee;
  }

  override pointerDown(e: ToolPointerEvent): void {
    if (e.button !== 'left') return;
    const ctx = this.requireCtx();
    this.down = true;
    this.downAt = e.position;
    this.downAtTile = e.tilePos;

    const obj = this.topMostMapObjectAt(e.position);
    if (obj) {
      this.updateSelection(obj, e.modifiers);
      const selected = ctx.doc.selectedObjects;
      this.dragSnapshots = [...selected].map((o) => ({ obj: o, startPos: o.position }));
      this.mode = 'move';
    } else {
      if (!e.modifiers.shift && !e.modifiers.ctrl) ctx.doc.selectedObjects.clear();
      this.marquee = { x: e.position.x, y: e.position.y, width: 0, height: 0 };
      this.mode = 'marquee';
    }
    ctx.invalidate();
  }

  override pointerMove(e: ToolPointerEvent): void {
    if (!this.down) return;
    if (this.mode === 'marquee') {
      const x = Math.min(this.downAt.x, e.position.x);
      const y = Math.min(this.downAt.y, e.position.y);
      this.marquee = {
        x,
        y,
        width: Math.abs(e.position.x - this.downAt.x),
        height: Math.abs(e.position.y - this.downAt.y),
      };
    } else if (this.mode === 'move') {
      const dx = e.position.x - this.downAt.x;
      const dy = e.position.y - this.downAt.y;
      for (const s of this.dragSnapshots) {
        s.obj.setPosition({ x: s.startPos.x + dx, y: s.startPos.y + dy });
      }
    }
    this.requireCtx().invalidate();
  }

  override pointerUp(e: ToolPointerEvent): void {
    if (!this.down || e.button !== 'left') return;
    this.down = false;
    const ctx = this.requireCtx();

    if (this.mode === 'marquee' && this.marquee) {
      this.selectInMarquee(this.marquee, e.modifiers);
    } else if (this.mode === 'move' && this.dragSnapshots.length > 0) {
      const moved = this.dragSnapshots.filter(
        (s) => s.obj.position.x !== s.startPos.x || s.obj.position.y !== s.startPos.y,
      );
      if (moved.length > 0) {
        // Restore start positions so each command captures the *original*
        // position as the oldValue when it runs `redo()`.
        const targets = moved.map((s) => ({
          obj: s.obj,
          start: s.startPos,
          end: { x: s.obj.position.x, y: s.obj.position.y },
        }));
        for (const t of targets) t.obj.setPosition(t.start);
        for (const t of targets) {
          ctx.push(new SetObjectPosition(ctx.doc, t.obj, t.end));
        }
      }
    }

    this.mode = 'none';
    this.marquee = null;
    this.dragSnapshots = [];
    ctx.invalidate();
  }

  private updateSelection(obj: MapObject, mods: ModifierState): void {
    const sel = this.requireCtx().doc.selectedObjects;
    if (mods.ctrl) {
      sel.add(obj);
    } else if (mods.shift) {
      if (sel.has(obj)) sel.delete(obj);
      else sel.add(obj);
    } else {
      if (!sel.has(obj)) {
        sel.clear();
        sel.add(obj);
      }
    }
  }

  private selectInMarquee(rect: Rect, mods: ModifierState): void {
    const og = this.currentObjectGroup();
    if (!og) return;
    const sel = this.requireCtx().doc.selectedObjects;
    if (!mods.shift && !mods.ctrl) sel.clear();
    for (const o of og.objects) {
      if (!o.visible) continue;
      const b = o.bounds();
      if (intersects(rect, b)) sel.add(o);
    }
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
