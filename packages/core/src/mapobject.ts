// Port of libtiled/mapobject.h+cpp.

import { TiledObject, ObjectTypeId } from './object.js';
import type { ColorString, Point, Rect, Size } from './types.js';
import { Alignment, FlipDirection } from './tiled.js';
import { MapOrientation } from './map.js';
import { Cell } from './cell.js';
import { cloneProperties } from './properties.js';

import type { ObjectGroup } from './objectgroup.js';
import type { ObjectTemplate } from './objecttemplate.js';
import type { Map as TiledMap } from './map.js';

export enum MapObjectShape {
  Rectangle = 0,
  Polygon = 1,
  Polyline = 2,
  Ellipse = 3,
  Capsule = 4,
  Text = 5,
  Point = 6,
}

export enum MapObjectChangedProperty {
  Name = 1 << 0,
  Visible = 1 << 1,
  Text = 1 << 2,
  TextFont = 1 << 3,
  TextAlignment = 1 << 4,
  TextWordWrap = 1 << 5,
  TextColor = 1 << 6,
  Position = 1 << 7,
  Size = 1 << 8,
  Rotation = 1 << 9,
  Opacity = 1 << 10,
  CellProperty = 1 << 11,
  Shape = 1 << 12,
  Template = 1 << 13,
  CustomProperties = 1 << 14,
  All = 0xff,
}

export interface FontDescription {
  family: string;
  pixelSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  kerning: boolean;
}

export interface TextData {
  text: string;
  font: FontDescription;
  color: ColorString;
  /** CSS text-align value: `'left' | 'center' | 'right' | 'justify'`. */
  horizontalAlignment: 'left' | 'center' | 'right' | 'justify';
  /** CSS vertical-align value: `'top' | 'center' | 'bottom'`. */
  verticalAlignment: 'top' | 'center' | 'bottom';
  wordWrap: boolean;
}

export interface MapObjectColors {
  main: ColorString;
  fill: ColorString;
}

export const DEFAULT_TEXT_DATA: TextData = {
  text: '',
  font: { family: 'sans-serif', pixelSize: 16, bold: false, italic: false, underline: false, strikeOut: false, kerning: true },
  color: '#000000',
  horizontalAlignment: 'left',
  verticalAlignment: 'top',
  wordWrap: true,
};

export class MapObject extends TiledObject {
  private _id = 0;
  private _shape: MapObjectShape = MapObjectShape.Rectangle;
  private _name: string;
  private _pos: Point;
  private _size: Size;
  private _textData: TextData = { ...DEFAULT_TEXT_DATA };
  private _polygon: Point[] = [];
  private _cell: Cell = new Cell();
  private _objectTemplate: ObjectTemplate | undefined = undefined;
  /** @internal */ objectGroup: ObjectGroup | undefined = undefined;
  rotation = 0;
  opacity = 1;
  visible = true;
  templateBase = false;
  changedProperties = 0;

  constructor(name = '', className = '', pos: Point = { x: 0, y: 0 }, size: Size = { width: 0, height: 0 }) {
    super(ObjectTypeId.MapObjectType, className);
    this._name = name;
    this._pos = pos;
    this._size = size;
  }

  /* ─── identity ─── */
  get id(): number {
    return this._id;
  }
  setId(id: number): void {
    this._id = id;
  }
  resetId(): void {
    this._id = 0;
  }
  index(): number {
    return this.objectGroup?.objects.indexOf(this) ?? -1;
  }

  /* ─── name / type ─── */
  get name(): string {
    return this._name;
  }
  setName(n: string): void {
    this._name = n;
  }

  /** When the object is a tile-object and has no class, falls through to the
   *  tile's class. Mirrors `MapObject::effectiveClassName`. */
  effectiveClassName(): string {
    if (this.className) return this.className;
    const t = this._cell.tile();
    return t?.className ?? '';
  }

  // Python-API compatibility:
  get type(): string {
    return this.className;
  }
  setType(t: string): void {
    this.setClassName(t);
  }
  effectiveType(): string {
    return this.effectiveClassName();
  }

  /* ─── geometry ─── */
  get position(): Point {
    return this._pos;
  }
  setPosition(p: Point): void {
    this._pos = p;
  }
  get x(): number {
    return this._pos.x;
  }
  setX(x: number): void {
    this._pos = { x, y: this._pos.y };
  }
  get y(): number {
    return this._pos.y;
  }
  setY(y: number): void {
    this._pos = { x: this._pos.x, y };
  }

  get size(): Size {
    return this._size;
  }
  setSize(s: Size): void {
    this._size = s;
  }
  get width(): number {
    return this._size.width;
  }
  setWidth(w: number): void {
    this._size = { width: w, height: this._size.height };
  }
  get height(): number {
    return this._size.height;
  }
  setHeight(h: number): void {
    this._size = { width: this._size.width, height: h };
  }

  setBounds(b: Rect): void {
    this._pos = { x: b.x, y: b.y };
    this._size = { width: b.width, height: b.height };
  }
  bounds(): Rect {
    return { x: this._pos.x, y: this._pos.y, width: this._size.width, height: this._size.height };
  }

  /* ─── text / polygon ─── */
  get textData(): TextData {
    return this._textData;
  }
  setTextData(t: TextData): void {
    this._textData = t;
  }

  get polygon(): readonly Point[] {
    return this._polygon;
  }
  setPolygon(p: Point[]): void {
    this._polygon = p.slice();
  }

  /* ─── shape ─── */
  get shape(): MapObjectShape {
    return this._shape;
  }
  setShape(s: MapObjectShape): void {
    this._shape = s;
  }
  hasDimensions(): boolean {
    return this._shape !== MapObjectShape.Point && this._shape !== MapObjectShape.Polyline;
  }
  canRotate(): boolean {
    return this._shape !== MapObjectShape.Point;
  }
  isTileObject(): boolean {
    return !this._cell.isEmpty();
  }

  /* ─── cell ─── */
  get cell(): Cell {
    return this._cell;
  }
  setCell(c: Cell): void {
    this._cell = c;
  }

  /* ─── template ─── */
  get objectTemplate(): ObjectTemplate | undefined {
    return this._objectTemplate;
  }
  setObjectTemplate(t: ObjectTemplate | undefined): void {
    this._objectTemplate = t;
  }
  templateObject(): MapObject | undefined {
    return this._objectTemplate?.object;
  }
  isTemplateInstance(): boolean {
    return this._objectTemplate !== undefined;
  }
  isTemplateBase(): boolean {
    return this.templateBase;
  }
  markAsTemplateBase(): void {
    this.templateBase = true;
  }

  /** Pull every non-overridden property in from the template object. */
  syncWithTemplate(): void {
    const tpl = this.templateObject();
    if (!tpl) return;
    if (!this.propertyChanged(MapObjectChangedProperty.Name)) this._name = tpl._name;
    if (!this.propertyChanged(MapObjectChangedProperty.Position)) this._pos = { ...tpl._pos };
    if (!this.propertyChanged(MapObjectChangedProperty.Size)) this._size = { ...tpl._size };
    if (!this.propertyChanged(MapObjectChangedProperty.Rotation)) this.rotation = tpl.rotation;
    if (!this.propertyChanged(MapObjectChangedProperty.Opacity)) this.opacity = tpl.opacity;
    if (!this.propertyChanged(MapObjectChangedProperty.Visible)) this.visible = tpl.visible;
    if (!this.propertyChanged(MapObjectChangedProperty.Shape)) this._shape = tpl._shape;
    if (!this.propertyChanged(MapObjectChangedProperty.CellProperty)) this._cell = Cell.from(tpl._cell);
  }

  /** Detach this object from its template, copying every value over and
   *  clearing the template back-reference. */
  detachFromTemplate(): void {
    if (!this._objectTemplate) return;
    const tpl = this.templateObject();
    if (tpl) {
      // Inherit any property the user hadn't yet overridden.
      this.syncWithTemplate();
    }
    this._objectTemplate = undefined;
  }

  /* ─── change-tracking ─── */
  setChangedProperties(p: number): void {
    this.changedProperties = p;
  }
  setPropertyChanged(p: MapObjectChangedProperty, state = true): void {
    this.changedProperties = state ? this.changedProperties | p : this.changedProperties & ~p;
  }
  propertyChanged(p: MapObjectChangedProperty): boolean {
    return Boolean(this.changedProperties & p);
  }

  /* ─── flip ─── */
  flip(direction: FlipDirection, origin: Point): void {
    if (this.isTileObject()) {
      this.flipInScreenCoordinates(direction, origin);
    } else {
      this.flipInPixelCoordinates(direction, origin);
    }
  }

  private flipInScreenCoordinates(direction: FlipDirection, origin: Point): void {
    if (direction === FlipDirection.FlipHorizontally) {
      this._pos = { x: 2 * origin.x - this._pos.x - this._size.width, y: this._pos.y };
      this._cell.setFlippedHorizontally(!this._cell.flippedHorizontally());
    } else {
      this._pos = { x: this._pos.x, y: 2 * origin.y - this._pos.y - this._size.height };
      this._cell.setFlippedVertically(!this._cell.flippedVertically());
    }
  }

  private flipInPixelCoordinates(direction: FlipDirection, origin: Point): void {
    if (direction === FlipDirection.FlipHorizontally) {
      this._pos = { x: 2 * origin.x - this._pos.x - this._size.width, y: this._pos.y };
      this._polygon = this._polygon.map((p) => ({ x: 2 * origin.x - p.x, y: p.y }));
    } else {
      this._pos = { x: this._pos.x, y: 2 * origin.y - this._pos.y - this._size.height };
      this._polygon = this._polygon.map((p) => ({ x: p.x, y: 2 * origin.y - p.y }));
    }
    this.rotation = -this.rotation;
  }

  alignment(map: TiledMap | undefined): Alignment {
    // Tile-objects align by tileset.objectAlignment (defaulting to BottomLeft
    // for orthogonal, Bottom for isometric); shape objects align TopLeft.
    if (this.isTileObject()) {
      const ts = this._cell.tileset;
      const a = ts?.objectAlignment ?? Alignment.Unspecified;
      if (a !== Alignment.Unspecified) return a;
      if (map?.orientation === MapOrientation.Isometric) return Alignment.Bottom;
      return Alignment.BottomLeft;
    }
    return Alignment.TopLeft;
  }

  /* ─── clone ─── */
  clone(): MapObject {
    const c = new MapObject(this._name, this.className, { ...this._pos }, { ...this._size });
    c._id = this._id;
    c._shape = this._shape;
    c._textData = { ...this._textData, font: { ...this._textData.font } };
    c._polygon = this._polygon.map((p) => ({ ...p }));
    c._cell = Cell.from(this._cell);
    c._objectTemplate = this._objectTemplate;
    c.rotation = this.rotation;
    c.opacity = this.opacity;
    c.visible = this.visible;
    c.templateBase = this.templateBase;
    c.changedProperties = this.changedProperties;
    c.setProperties(cloneProperties(this.properties));
    return c;
  }

  copyPropertiesFrom(other: MapObject): void {
    this._name = other._name;
    this.setClassName(other.className);
    this._shape = other._shape;
    this._pos = { ...other._pos };
    this._size = { ...other._size };
    this._textData = { ...other._textData, font: { ...other._textData.font } };
    this._polygon = other._polygon.map((p) => ({ ...p }));
    this._cell = Cell.from(other._cell);
    this.rotation = other.rotation;
    this.opacity = other.opacity;
    this.visible = other.visible;
    this.setProperties(cloneProperties(other.properties));
  }
}
