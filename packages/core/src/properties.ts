// Port of libtiled/properties.h+cpp.
//
// Tiled stores per-object custom properties as a `QVariantMap`. The variant
// model carries the value *and* its runtime meta-type (int vs float, plain
// QString vs QColor, etc.), which is why the editor can round-trip a property
// declared as `int` even when the user typed `5.0`. We mirror that behaviour
// here with an explicit tagged union: every property value carries its `kind`.

import type { ColorString } from './types.js';

export type PrimitiveKind = 'string' | 'int' | 'float' | 'bool';
export type PropertyKind =
  | PrimitiveKind
  | 'color'
  | 'file'
  | 'object'
  | 'class'
  | 'enum';

export interface StringValue {
  kind: 'string';
  value: string;
}
export interface IntValue {
  kind: 'int';
  value: number;
}
export interface FloatValue {
  kind: 'float';
  value: number;
}
export interface BoolValue {
  kind: 'bool';
  value: boolean;
}
export interface ColorValue {
  kind: 'color';
  value: ColorString;
}
export interface FileValue {
  kind: 'file';
  url: string;
}
export interface ObjectRefValue {
  kind: 'object';
  id: number;
}
export interface ClassValue {
  kind: 'class';
  typeName: string;
  members: Properties;
}
export interface EnumValue {
  kind: 'enum';
  typeName: string;
  value: number | string;
  flags?: boolean;
}

export type PropertyValue =
  | StringValue
  | IntValue
  | FloatValue
  | BoolValue
  | ColorValue
  | FileValue
  | ObjectRefValue
  | ClassValue
  | EnumValue;

export type Properties = Map<string, PropertyValue>;

/* ──────────────────────────── factory helpers ─────────────────────────── */

export const Property = {
  string(value: string): StringValue {
    return { kind: 'string', value };
  },
  int(value: number): IntValue {
    return { kind: 'int', value: value | 0 };
  },
  float(value: number): FloatValue {
    return { kind: 'float', value };
  },
  bool(value: boolean): BoolValue {
    return { kind: 'bool', value };
  },
  color(value: ColorString): ColorValue {
    return { kind: 'color', value };
  },
  file(url: string): FileValue {
    return { kind: 'file', url };
  },
  object(id: number): ObjectRefValue {
    return { kind: 'object', id };
  },
  class(typeName: string, members: Properties = new Map()): ClassValue {
    return { kind: 'class', typeName, members };
  },
  enum(typeName: string, value: number | string, flags = false): EnumValue {
    return flags
      ? { kind: 'enum', typeName, value, flags: true }
      : { kind: 'enum', typeName, value };
  },
};

/* ──────────────────────────── pure helpers ────────────────────────────── */

/** Converts a property value to the string representation Tiled uses in the
 *  property browser. Mirrors `Tiled::Object::propertyAsString`. */
export function propertyValueToString(v: PropertyValue): string {
  switch (v.kind) {
    case 'string':
      return v.value;
    case 'int':
      return String(v.value);
    case 'float':
      // QString::number for a float emits no trailing zeros.
      return Number.isInteger(v.value) ? `${v.value}.0` : String(v.value);
    case 'bool':
      return v.value ? 'true' : 'false';
    case 'color':
      return v.value;
    case 'file':
      return v.url;
    case 'object':
      return String(v.id);
    case 'class':
      return `[class ${v.typeName}]`;
    case 'enum':
      return String(v.value);
  }
}

/** Returns the user-facing type label, matching libtiled's `typeName()`. */
export function propertyTypeName(v: PropertyValue): string {
  switch (v.kind) {
    case 'string':
      return 'string';
    case 'int':
      return 'int';
    case 'float':
      return 'float';
    case 'bool':
      return 'bool';
    case 'color':
      return 'color';
    case 'file':
      return 'file';
    case 'object':
      return 'object';
    case 'class':
      return v.typeName || 'class';
    case 'enum':
      return v.typeName || 'enum';
  }
}

/** Deep-copy a property value. */
export function clonePropertyValue(v: PropertyValue): PropertyValue {
  switch (v.kind) {
    case 'class':
      return { kind: 'class', typeName: v.typeName, members: cloneProperties(v.members) };
    default:
      return { ...v };
  }
}

/** Deep-copy an entire properties collection. */
export function cloneProperties(p: Properties): Properties {
  const out: Properties = new Map();
  for (const [k, v] of p) out.set(k, clonePropertyValue(v));
  return out;
}

/** `target[k] = source[k]` for every k in `source`. Mirrors Tiled's
 *  `mergeProperties` — destructively updates target. */
export function mergeProperties(target: Properties, source: Properties): void {
  for (const [k, v] of source) target.set(k, clonePropertyValue(v));
}

/** A path element identifies either a member of a class value (string) or an
 *  index of an array (number). Mirrors libtiled `Tiled::PathElement`. */
export type PathElement = string | number;
export type PropertyPath = readonly PathElement[];

export function toPropertyPath(parts: readonly string[]): PropertyPath {
  return parts.map((p) => {
    const i = parseInt(p, 10);
    return /^\d+$/.test(p) ? i : p;
  });
}

export function pathToString(path: PropertyPath): string {
  return path
    .map((e) => (typeof e === 'number' ? `[${e}]` : e))
    .join('.')
    .replace(/\.\[/g, '[');
}

/**
 * Set the value at `path` inside the property bag `properties`. Walks through
 * nested `class` values, replacing them with cloned copies along the way so
 * the original tree remains untouched (suitable for undo snapshots).
 *
 * Mirrors libtiled's `setPropertyMemberValue` — returns `true` on success.
 */
export function setPropertyMemberValue(
  properties: Properties,
  path: PropertyPath,
  value: PropertyValue,
): boolean {
  if (path.length === 0) return false;
  const [head, ...rest] = path;
  if (typeof head !== 'string') return false;
  if (rest.length === 0) {
    properties.set(head, value);
    return true;
  }
  const current = properties.get(head);
  if (!current || current.kind !== 'class') return false;
  const cloned = clonePropertyValue(current) as ClassValue;
  if (!setNestedPath(cloned, rest, value)) return false;
  properties.set(head, cloned);
  return true;
}

function setNestedPath(node: ClassValue, path: PropertyPath, value: PropertyValue): boolean {
  const [head, ...rest] = path;
  if (typeof head !== 'string') return false;
  if (rest.length === 0) {
    node.members.set(head, value);
    return true;
  }
  const child = node.members.get(head);
  if (!child || child.kind !== 'class') return false;
  const cloned = clonePropertyValue(child) as ClassValue;
  if (!setNestedPath(cloned, rest, value)) return false;
  node.members.set(head, cloned);
  return true;
}

/** Convenience getter mirroring `setPropertyMemberValue`. */
export function getPropertyMemberValue(
  properties: Properties,
  path: PropertyPath,
): PropertyValue | undefined {
  if (path.length === 0) return undefined;
  let node: PropertyValue | undefined = properties.get(path[0] as string);
  for (let i = 1; i < path.length; i++) {
    if (!node || node.kind !== 'class') return undefined;
    const key = path[i];
    if (typeof key !== 'string') return undefined;
    node = node.members.get(key);
  }
  return node;
}

/* ───────────────────── aggregation across selections ──────────────────── */

export interface AggregatedPropertyData {
  value: PropertyValue;
  presenceCount: number;
  valueConsistent: boolean;
}

export type AggregatedProperties = Map<string, AggregatedPropertyData>;

export function aggregateProperties(
  aggregated: AggregatedProperties,
  properties: Properties,
): void {
  for (const [name, value] of properties) {
    const prev = aggregated.get(name);
    if (!prev) {
      aggregated.set(name, {
        value: clonePropertyValue(value),
        presenceCount: 1,
        valueConsistent: true,
      });
    } else {
      prev.presenceCount += 1;
      prev.valueConsistent &&= propertyValuesEqual(prev.value, value);
    }
  }
}

export function propertyValuesEqual(a: PropertyValue, b: PropertyValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'class': {
      const bb = b as ClassValue;
      if (a.typeName !== bb.typeName) return false;
      if (a.members.size !== bb.members.size) return false;
      for (const [k, v] of a.members) {
        const other = bb.members.get(k);
        if (!other || !propertyValuesEqual(v, other)) return false;
      }
      return true;
    }
    case 'enum': {
      const bb = b as EnumValue;
      return (
        a.typeName === bb.typeName &&
        a.value === bb.value &&
        Boolean(a.flags) === Boolean(bb.flags)
      );
    }
    case 'object':
      return a.id === (b as ObjectRefValue).id;
    case 'file':
      return a.url === (b as FileValue).url;
    default:
      return (a as { value: unknown }).value === (b as { value: unknown }).value;
  }
}
