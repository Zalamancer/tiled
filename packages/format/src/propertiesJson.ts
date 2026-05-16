// Convert `Properties` ↔ Tiled-JSON `properties` array.

import {
  type Properties,
  type PropertyValue,
  Property,
  cloneProperties,
} from '@tiled-ts/core';

interface JsonProperty {
  name: string;
  type: string;
  propertytype?: string;
  value: unknown;
}

export function propertiesToJson(props: Properties): JsonProperty[] {
  const out: JsonProperty[] = [];
  for (const [name, value] of props) out.push(propertyToJson(name, value));
  return out;
}

export function propertiesFromJson(arr: readonly JsonProperty[] | undefined): Properties {
  const out: Properties = new Map();
  if (!arr) return out;
  for (const e of arr) {
    const v = propertyFromJson(e);
    if (v) out.set(e.name, v);
  }
  return out;
}

function propertyToJson(name: string, v: PropertyValue): JsonProperty {
  switch (v.kind) {
    case 'string':
      return { name, type: 'string', value: v.value };
    case 'int':
      return { name, type: 'int', value: v.value };
    case 'float':
      return { name, type: 'float', value: v.value };
    case 'bool':
      return { name, type: 'bool', value: v.value };
    case 'color':
      return { name, type: 'color', value: v.value };
    case 'file':
      return { name, type: 'file', value: v.url };
    case 'object':
      return { name, type: 'object', value: v.id };
    case 'class': {
      const obj: Record<string, unknown> = {};
      for (const [k, vv] of v.members) obj[k] = propertyToJson(k, vv).value;
      return { name, type: 'class', propertytype: v.typeName, value: obj };
    }
    case 'enum':
      return {
        name,
        type: typeof v.value === 'number' ? 'int' : 'string',
        propertytype: v.typeName,
        value: v.value,
      };
  }
}

function propertyFromJson(e: JsonProperty): PropertyValue | undefined {
  switch (e.type) {
    case 'string':
      return Property.string(String(e.value ?? ''));
    case 'int':
      return e.propertytype
        ? Property.enum(e.propertytype, Number(e.value))
        : Property.int(Number(e.value));
    case 'float':
      return Property.float(Number(e.value));
    case 'bool':
      return Property.bool(Boolean(e.value));
    case 'color':
      return Property.color(String(e.value ?? '#000000'));
    case 'file':
      return Property.file(String(e.value ?? ''));
    case 'object':
      return Property.object(Number(e.value));
    case 'class': {
      const inner: Properties = new Map();
      for (const [k, vv] of Object.entries(e.value as Record<string, unknown>)) {
        const sub = propertyFromJson({ name: k, type: inferType(vv), value: vv });
        if (sub) inner.set(k, sub);
      }
      return Property.class(e.propertytype ?? '', inner);
    }
    default:
      return undefined;
  }
}

function inferType(v: unknown): string {
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  return 'string';
}

// Re-export for convenience
export { cloneProperties };
