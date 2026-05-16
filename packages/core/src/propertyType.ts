// Port of libtiled/propertytype.h+cpp.
//
// User-defined custom property types: classes (composite values) and enums
// (named integers / strings, optional bit-flag semantics). The original C++
// keeps these in a `PropertyTypes` container shared via `QSharedPointer`; we
// keep an analogous `PropertyTypes` collection and reference types by id.

import type { ColorString } from './types.js';
import type { Properties, PropertyValue } from './properties.js';
import { Property, cloneProperties } from './properties.js';

export enum PropertyTypeKind {
  Invalid = 0,
  Class = 1,
  Enum = 2,
}

export enum ClassUsageFlag {
  PropertyValueType = 0x001,
  // Keep values synchronized with `Object.TypeId`.
  LayerClass = 0x002,
  MapObjectClass = 0x004,
  MapClass = 0x008,
  TilesetClass = 0x010,
  TileClass = 0x020,
  WangSetClass = 0x040,
  WangColorClass = 0x080,
  ProjectClass = 0x100,
  AnyUsage = 0xfff,
  AnyObjectClass = 0xfff & ~0x001,
}

export enum EnumStorageType {
  StringValue = 0,
  IntValue = 1,
}

interface PropertyTypeBase {
  readonly kind: PropertyTypeKind;
  id: number;
  name: string;
}

export interface EnumPropertyType extends PropertyTypeBase {
  kind: PropertyTypeKind.Enum;
  storageType: EnumStorageType;
  values: string[];
  valuesAsFlags: boolean;
}

export interface ClassPropertyType extends PropertyTypeBase {
  kind: PropertyTypeKind.Class;
  members: Properties;
  color: ColorString;
  usageFlags: number;
  memberValuesResolved: boolean;
  drawFill: boolean;
}

export type PropertyType = EnumPropertyType | ClassPropertyType;

/* ─────────────────────────────── factories ───────────────────────────── */

export function createEnumType(
  name: string,
  values: string[] = [],
  opts: { storageType?: EnumStorageType; valuesAsFlags?: boolean } = {},
): EnumPropertyType {
  return {
    kind: PropertyTypeKind.Enum,
    id: 0,
    name,
    storageType: opts.storageType ?? EnumStorageType.StringValue,
    values: [...values],
    valuesAsFlags: opts.valuesAsFlags ?? false,
  };
}

export function createClassType(
  name: string,
  opts: {
    members?: Properties;
    color?: ColorString;
    usageFlags?: number;
    drawFill?: boolean;
  } = {},
): ClassPropertyType {
  return {
    kind: PropertyTypeKind.Class,
    id: 0,
    name,
    members: opts.members ? cloneProperties(opts.members) : new Map(),
    color: opts.color ?? '#808080',
    usageFlags: opts.usageFlags ?? ClassUsageFlag.AnyUsage,
    memberValuesResolved: true,
    drawFill: opts.drawFill ?? true,
  };
}

/* ─────────────────────────── default values ───────────────────────────── */

export function defaultValueForType(type: PropertyType): PropertyValue {
  if (type.kind === PropertyTypeKind.Enum) {
    if (type.storageType === EnumStorageType.IntValue) {
      return Property.enum(type.name, 0, type.valuesAsFlags);
    }
    return Property.enum(type.name, type.values[0] ?? '', type.valuesAsFlags);
  }
  return Property.class(type.name, cloneProperties(type.members));
}

/* ───────────────────────── PropertyTypes container ───────────────────── */

export class PropertyTypes {
  private types: PropertyType[] = [];
  private nextId = 0;

  add(type: PropertyType): PropertyType {
    if (type.id === 0) type.id = ++this.nextId;
    else this.nextId = Math.max(this.nextId, type.id);
    this.types.push(type);
    return type;
  }

  clear(): void {
    this.types = [];
  }

  size(): number {
    return this.types.length;
  }

  count(kind: PropertyTypeKind): number {
    return this.types.filter((t) => t.kind === kind).length;
  }

  removeAt(index: number): void {
    this.types.splice(index, 1);
  }

  takeAt(index: number): PropertyType | undefined {
    const [t] = this.types.splice(index, 1);
    return t;
  }

  typeAt(index: number): PropertyType | undefined {
    return this.types[index];
  }

  moveType(from: number, to: number): void {
    if (from === to) return;
    const [t] = this.types.splice(from, 1);
    if (t) this.types.splice(to, 0, t);
  }

  merge(other: PropertyTypes): void {
    for (const t of other) this.add(t);
  }

  findIndexByName(name: string): number {
    return this.types.findIndex((t) => t.name === name);
  }

  findTypeById(id: number): PropertyType | undefined {
    return this.types.find((t) => t.id === id);
  }

  findTypeByName(name: string, usageFlags = ClassUsageFlag.AnyUsage): PropertyType | undefined {
    return this.types.find(
      (t) =>
        t.name === name &&
        (t.kind === PropertyTypeKind.Enum ||
          (t as ClassPropertyType).usageFlags & usageFlags),
    );
  }

  findPropertyValueType(name: string): PropertyType | undefined {
    return this.types.find(
      (t) =>
        t.name === name &&
        (t.kind === PropertyTypeKind.Enum ||
          (t.kind === PropertyTypeKind.Class &&
            t.usageFlags & ClassUsageFlag.PropertyValueType)),
    );
  }

  *[Symbol.iterator](): IterableIterator<PropertyType> {
    yield* this.types;
  }
}

export type SharedPropertyTypes = PropertyTypes;
