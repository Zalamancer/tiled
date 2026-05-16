// Base abstractions ported from src/tiled/abstracttool.{h,cpp}.
//
// The web port discards Qt's QGraphicsScene plumbing. Tools receive plain
// `PointerEvent`s and `ModifierState`s; output is one or more undo commands
// (for permanent edits) plus an optional `ToolPreview` describing what the
// host should overlay on top of the live map.

import type { Layer, Point, TileLayer, TileRegion } from '@tiled-ts/core';
import type { MapDocument, UndoCommand } from '@tiled-ts/commands';

export interface ModifierState {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export type PointerButton = 'left' | 'right' | 'middle';

export interface ToolPointerEvent {
  /** Map-pixel coordinates of the cursor (already de-zoomed). */
  position: Point;
  /** Map-tile coordinates (floor of `pixelToTile(position)`). */
  tilePos: Point;
  /** Buttons currently pressed (bitmask, like DOM `MouseEvent.buttons`). */
  buttons: number;
  /** Button associated with the event, if any. */
  button: PointerButton | undefined;
  modifiers: ModifierState;
}

export interface ToolPreview {
  /** Stamp layer (cells in local-coords) — `null` when nothing to draw. */
  stamp: TileLayer | null;
  /** Map-tile origin of `stamp.cellAt(0,0)`. */
  origin: Point;
  /** Affected cells, in target-local coords. */
  region: TileRegion;
}

export interface ToolContext {
  doc: MapDocument;
  /** Active target tile layer, or `undefined`. */
  currentLayer(): Layer | undefined;
  /** Called by the tool when its preview/state changed and the host should re-render. */
  invalidate(): void;
  /** Called by the tool to push an undo command. */
  push(command: UndoCommand): void;
}

export const EmptyModifiers: ModifierState = Object.freeze({
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
});

export abstract class Tool {
  protected ctx: ToolContext | null = null;

  constructor(public readonly id: string, public readonly name: string) {}

  activate(ctx: ToolContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.ctx = null;
  }

  pointerEntered(_e: ToolPointerEvent): void {}
  pointerLeft(): void {}
  pointerDown(_e: ToolPointerEvent): void {}
  pointerMove(_e: ToolPointerEvent): void {}
  pointerUp(_e: ToolPointerEvent): void {}
  keyDown(_key: string, _modifiers: ModifierState): boolean {
    return false; // not handled
  }

  /** Most-recent preview, or `null` when nothing should be overlaid. */
  preview(): ToolPreview | null {
    return null;
  }

  protected requireCtx(): ToolContext {
    if (!this.ctx) throw new Error('tool used before activate()');
    return this.ctx;
  }

  /** Convenience: the active tile layer or `undefined`. */
  protected currentTileLayer(): TileLayer | undefined {
    const l = this.ctx?.currentLayer();
    return l?.isTileLayer() ? (l as TileLayer) : undefined;
  }
}
