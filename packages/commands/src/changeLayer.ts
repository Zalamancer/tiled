// Port of src/tiled/changelayer.{h,cpp}.
//
// Each `ChangeLayer*` command takes the new value, snapshots the old one in
// the constructor, and merges with subsequent commands of the same id when
// applied to the same target layer (so dragging an opacity slider produces
// one undo entry, not 60).

import type { ColorString, Layer, Point } from '@tiled-ts/core';
import { UndoCommandId } from './undoCommandIds.js';
import type { MapDocument } from './mapDocument.js';
import type { UndoCommand } from './undoStack.js';

enum LayerChangedFlag {
  Name = 1 << 0,
  Visible = 1 << 1,
  Locked = 1 << 2,
  Opacity = 1 << 3,
  Offset = 1 << 4,
  Parallax = 1 << 5,
  TintColor = 1 << 6,
  BlendMode = 1 << 7,
  ClassName = 1 << 8,
}

abstract class ChangeLayerCommand<V> implements UndoCommand {
  abstract id: number;
  abstract text: string;
  protected oldValue!: V;

  constructor(
    protected readonly doc: MapDocument,
    protected readonly layer: Layer,
    protected newValue: V,
  ) {}

  protected abstract read(layer: Layer): V;
  protected abstract write(layer: Layer, value: V): void;
  protected abstract changedFlag(): number;

  redo(): void {
    this.oldValue = this.read(this.layer);
    this.write(this.layer, this.newValue);
    this.fire();
  }
  undo(): void {
    this.write(this.layer, this.oldValue);
    this.fire();
  }

  protected fire(): void {
    this.doc.emit({
      kind: 'layer-changed',
      map: this.doc.map,
      layer: this.layer,
      properties: this.changedFlag(),
    });
  }

  mergeWith(other: UndoCommand): boolean {
    const o = other as ChangeLayerCommand<V>;
    if (o.layer !== this.layer || o.id !== this.id) return false;
    this.newValue = o.newValue;
    return true;
  }
}

export class SetLayerName extends ChangeLayerCommand<string> {
  id = UndoCommandId.ChangeLayerName;
  text = 'Rename Layer';
  protected read(l: Layer): string { return l.name; }
  protected write(l: Layer, v: string): void { l.name = v; }
  protected changedFlag(): number { return LayerChangedFlag.Name; }
}

export class SetLayerVisible extends ChangeLayerCommand<boolean> {
  id = UndoCommandId.ChangeLayerVisible;
  text = 'Toggle Layer Visibility';
  protected read(l: Layer): boolean { return l.visible; }
  protected write(l: Layer, v: boolean): void { l.visible = v; }
  protected changedFlag(): number { return LayerChangedFlag.Visible; }
}

export class SetLayerLocked extends ChangeLayerCommand<boolean> {
  id = UndoCommandId.ChangeLayerLocked;
  text = 'Toggle Layer Lock';
  protected read(l: Layer): boolean { return l.locked; }
  protected write(l: Layer, v: boolean): void { l.locked = v; }
  protected changedFlag(): number { return LayerChangedFlag.Locked; }
}

export class SetLayerOpacity extends ChangeLayerCommand<number> {
  id = UndoCommandId.ChangeLayerOpacity;
  text = 'Change Layer Opacity';
  protected read(l: Layer): number { return l.opacity; }
  protected write(l: Layer, v: number): void { l.opacity = v; }
  protected changedFlag(): number { return LayerChangedFlag.Opacity; }
}

export class SetLayerOffset extends ChangeLayerCommand<Point> {
  id = UndoCommandId.ChangeLayerOffset;
  text = 'Change Layer Offset';
  protected read(l: Layer): Point { return { ...l.offset }; }
  protected write(l: Layer, v: Point): void { l.offset = { x: v.x, y: v.y }; }
  protected changedFlag(): number { return LayerChangedFlag.Offset; }
}

export class SetLayerParallaxFactor extends ChangeLayerCommand<Point> {
  id = UndoCommandId.ChangeLayerParallaxFactor;
  text = 'Change Layer Parallax';
  protected read(l: Layer): Point { return { ...l.parallaxFactor }; }
  protected write(l: Layer, v: Point): void { l.parallaxFactor = { x: v.x, y: v.y }; }
  protected changedFlag(): number { return LayerChangedFlag.Parallax; }
}

export class SetLayerTintColor extends ChangeLayerCommand<ColorString | undefined> {
  id = UndoCommandId.ChangeLayerTintColor;
  text = 'Change Layer Tint';
  protected read(l: Layer): ColorString | undefined { return l.tintColor; }
  protected write(l: Layer, v: ColorString | undefined): void { l.tintColor = v; }
  protected changedFlag(): number { return LayerChangedFlag.TintColor; }
}
