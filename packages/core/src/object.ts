// Port of libtiled/object.h+cpp.
//
// Object is the property-bag root that every Tiled entity (Layer, MapObject,
// Map, Tileset, Tile, WangSet, WangColor, Project, World) extends. We model
// the type-id flags exactly as upstream so the bit-flags line up with
// `ClassUsageFlag` for class-property usage filtering.

import {
  type Properties,
  type PropertyValue,
  cloneProperties,
  mergeProperties,
} from './properties.js';
import { type PropertyTypes, type ClassPropertyType, ClassUsageFlag, PropertyTypeKind } from './propertyType.js';

export enum ObjectTypeId {
  LayerType = 0x002,
  MapObjectType = 0x004,
  MapType = 0x008,
  TilesetType = 0x010,
  TileType = 0x020,
  WangSetType = 0x040,
  WangColorType = 0x080,
  ProjectType = 0x100,
  WorldType = 0x200,
}

export abstract class TiledObject {
  readonly typeId: ObjectTypeId;
  private _className: string;
  private _properties: Properties = new Map();

  protected constructor(typeId: ObjectTypeId, className = '') {
    this.typeId = typeId;
    this._className = className;
  }

  get className(): string {
    return this._className;
  }

  setClassName(name: string): void {
    this._className = name;
  }

  get properties(): Properties {
    return this._properties;
  }

  setProperties(p: Properties): void {
    this._properties = cloneProperties(p);
  }

  clearProperties(): void {
    this._properties.clear();
  }

  mergeProperties(p: Properties): void {
    mergeProperties(this._properties, p);
  }

  property(name: string): PropertyValue | undefined {
    return this._properties.get(name);
  }

  hasProperty(name: string): boolean {
    return this._properties.has(name);
  }

  setProperty(name: string, value: PropertyValue): void {
    this._properties.set(name, value);
  }

  removeProperty(name: string): void {
    this._properties.delete(name);
  }

  /** Returns true when this object lives inside a tileset (and so cannot live
   *  in a map directly). Mirrors `Object::isPartOfTileset()`. */
  get isPartOfTileset(): boolean {
    switch (this.typeId) {
      case ObjectTypeId.TilesetType:
      case ObjectTypeId.TileType:
      case ObjectTypeId.WangSetType:
      case ObjectTypeId.WangColorType:
        return true;
      default:
        return false;
    }
  }

  classType(types: PropertyTypes): ClassPropertyType | undefined {
    if (!this._className) return undefined;
    const usage: ClassUsageFlag = ObjectTypeId[this.typeId] as unknown as ClassUsageFlag;
    const found = types.findTypeByName(this._className, usage);
    if (found && found.kind === PropertyTypeKind.Class) return found;
    return undefined;
  }
}
