// Wrapper around `Layer`. Mirrors EditableLayer from src/tiled/editablelayer.h.
//
// Subclasses (`EditableTileLayer`, `EditableObjectGroup`, `EditableImageLayer`,
// `EditableGroupLayer`) add type-specific operations. Field setters route
// through `ChangeLayer*` commands when there's an active document.

import {
  Layer,
  LayerTypeFlag,
  type ColorString,
  type Point,
} from '@tiled-ts/core';
import {
  SetLayerName,
  SetLayerOffset,
  SetLayerOpacity,
  SetLayerParallaxFactor,
  SetLayerTintColor,
  SetLayerLocked,
  SetLayerVisible,
  type MapDocument,
  type UndoCommand,
} from '@tiled-ts/commands';

import type { ScriptHost } from './scriptHost.js';

export class EditableLayer {
  readonly raw: Layer;
  /** @internal — provided by `ScriptHost` so setters can find the active doc. */
  host: ScriptHost | undefined;

  constructor(raw: Layer) {
    this.raw = raw;
  }

  get id(): number {
    return this.raw.id;
  }
  get name(): string {
    return this.raw.name;
  }
  set name(v: string) {
    this.push((doc) => new SetLayerName(doc, this.raw, v), () => {
      this.raw.name = v;
    });
  }
  get opacity(): number {
    return this.raw.opacity;
  }
  set opacity(v: number) {
    this.push((doc) => new SetLayerOpacity(doc, this.raw, v), () => {
      this.raw.opacity = v;
    });
  }
  get visible(): boolean {
    return this.raw.visible;
  }
  set visible(v: boolean) {
    this.push((doc) => new SetLayerVisible(doc, this.raw, v), () => {
      this.raw.visible = v;
    });
  }
  get locked(): boolean {
    return this.raw.locked;
  }
  set locked(v: boolean) {
    this.push((doc) => new SetLayerLocked(doc, this.raw, v), () => {
      this.raw.locked = v;
    });
  }
  get offset(): Point {
    return this.raw.offset;
  }
  set offset(v: Point) {
    this.push((doc) => new SetLayerOffset(doc, this.raw, v), () => {
      this.raw.offset = { x: v.x, y: v.y };
    });
  }
  get parallaxFactor(): Point {
    return this.raw.parallaxFactor;
  }
  set parallaxFactor(v: Point) {
    this.push((doc) => new SetLayerParallaxFactor(doc, this.raw, v), () => {
      this.raw.parallaxFactor = { x: v.x, y: v.y };
    });
  }
  get tintColor(): ColorString | undefined {
    return this.raw.tintColor;
  }
  set tintColor(v: ColorString | undefined) {
    this.push((doc) => new SetLayerTintColor(doc, this.raw, v), () => {
      this.raw.tintColor = v;
    });
  }

  get isTileLayer(): boolean {
    return this.raw.layerType === LayerTypeFlag.TileLayerType;
  }
  get isObjectLayer(): boolean {
    return this.raw.layerType === LayerTypeFlag.ObjectGroupType;
  }
  get isImageLayer(): boolean {
    return this.raw.layerType === LayerTypeFlag.ImageLayerType;
  }
  get isGroupLayer(): boolean {
    return this.raw.layerType === LayerTypeFlag.GroupLayerType;
  }

  protected push(makeCommand: (doc: MapDocument) => UndoCommand, direct: () => void): void {
    const doc = this.host?.activeDocument();
    if (doc) {
      doc.undoStack.push(makeCommand(doc));
    } else {
      direct();
    }
  }
}
