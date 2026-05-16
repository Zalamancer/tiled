// Wrapper around `Map`. Mirrors EditableMap from src/tiled/editablemap.h.
//
// Property setters route through `ChangeMap*` commands when a document is
// active so that the change shows up in the undo stack and emits the right
// events. Without a document, the change is applied directly to the raw map —
// useful for scripts that build maps programmatically.

import {
  Map as TiledMap,
  MapOrientation,
  RenderOrder,
  StaggerAxis,
  StaggerIndex,
  type ColorString,
  type Layer,
  type Size,
} from '@tiled-ts/core';
import {
  ResizeMap,
  SetMapBackgroundColor,
  SetMapInfinite,
  SetMapOrientation,
  SetMapRenderOrder,
  SetMapTileSize,
  type MapDocument,
  type UndoCommand,
} from '@tiled-ts/commands';

import type { ScriptHost } from './scriptHost.js';
import { EditableLayer } from './editableLayer.js';
import { EditableTileset } from './editableTileset.js';
import { wrapLayer } from './wrapLayer.js';

export class EditableMap {
  readonly raw: TiledMap;
  /** @internal */ host: ScriptHost | undefined;

  constructor(raw: TiledMap) {
    this.raw = raw;
  }

  /* ─── parameters ─── */
  get width(): number {
    return this.raw.width;
  }
  set width(v: number) {
    this.resize({ width: v, height: this.raw.height });
  }
  get height(): number {
    return this.raw.height;
  }
  set height(v: number) {
    this.resize({ width: this.raw.width, height: v });
  }
  get size(): Size {
    return this.raw.size;
  }
  setSize(width: number, height: number): void {
    this.resize({ width, height });
  }
  get tileWidth(): number {
    return this.raw.tileWidth;
  }
  set tileWidth(v: number) {
    this.setTileSize(v, this.raw.tileHeight);
  }
  get tileHeight(): number {
    return this.raw.tileHeight;
  }
  set tileHeight(v: number) {
    this.setTileSize(this.raw.tileWidth, v);
  }
  setTileSize(width: number, height: number): void {
    this.push(
      (doc) => new SetMapTileSize(doc, { width, height }),
      () => this.raw.setTileSize({ width, height }),
    );
  }
  get infinite(): boolean {
    return this.raw.infinite;
  }
  set infinite(v: boolean) {
    this.push((doc) => new SetMapInfinite(doc, v), () => this.raw.setInfinite(v));
  }
  get orientation(): MapOrientation {
    return this.raw.orientation;
  }
  set orientation(v: MapOrientation) {
    this.push((doc) => new SetMapOrientation(doc, v), () => this.raw.setOrientation(v));
  }
  get renderOrder(): RenderOrder {
    return this.raw.renderOrder;
  }
  set renderOrder(v: RenderOrder) {
    this.push((doc) => new SetMapRenderOrder(doc, v), () => this.raw.setRenderOrder(v));
  }
  get staggerAxis(): StaggerAxis {
    return this.raw.staggerAxis;
  }
  set staggerAxis(v: StaggerAxis) {
    this.raw.setStaggerAxis(v);
  }
  get staggerIndex(): StaggerIndex {
    return this.raw.staggerIndex;
  }
  set staggerIndex(v: StaggerIndex) {
    this.raw.setStaggerIndex(v);
  }
  get backgroundColor(): ColorString | undefined {
    return this.raw.backgroundColor;
  }
  set backgroundColor(v: ColorString | undefined) {
    this.push(
      (doc) => new SetMapBackgroundColor(doc, v),
      () => this.raw.setBackgroundColor(v),
    );
  }
  get className(): string {
    return this.raw.className;
  }
  set className(v: string) {
    this.raw.setClassName(v);
  }
  get fileName(): string {
    return this.raw.fileName;
  }

  /* ─── layer container ─── */
  get layerCount(): number {
    return this.raw.layers.length;
  }
  layerAt(index: number): EditableLayer | undefined {
    const l = this.raw.layerAt(index);
    return l ? this.wrap(l) : undefined;
  }
  layers(): EditableLayer[] {
    return this.raw.layers.map((l) => this.wrap(l));
  }
  addLayer(layer: EditableLayer): void {
    this.raw.addLayer(layer.raw);
  }
  insertLayerAt(index: number, layer: EditableLayer): void {
    this.raw.insertLayer(index, layer.raw);
  }
  removeLayerAt(index: number): void {
    this.raw.takeLayerAt(index);
  }
  removeLayer(layer: EditableLayer): void {
    const i = this.raw.layers.indexOf(layer.raw);
    if (i >= 0) this.raw.takeLayerAt(i);
  }

  /* ─── tilesets ─── */
  tilesets(): EditableTileset[] {
    return this.raw.tilesets.map((t) => new EditableTileset(t));
  }
  addTileset(ts: EditableTileset): boolean {
    return this.raw.addTileset(ts.raw);
  }

  private wrap(layer: Layer): EditableLayer {
    const wrapped = wrapLayer(layer);
    wrapped.host = this.host;
    return wrapped;
  }

  private resize(s: Size): void {
    this.push(
      (doc) => new ResizeMap(doc, s),
      () => {
        this.raw.setWidth(s.width);
        this.raw.setHeight(s.height);
      },
    );
  }

  private push(makeCommand: (doc: MapDocument) => UndoCommand, direct: () => void): void {
    const doc = this.host?.activeDocument();
    if (doc) {
      doc.undoStack.push(makeCommand(doc));
    } else {
      direct();
    }
  }
}
