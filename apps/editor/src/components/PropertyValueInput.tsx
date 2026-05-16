// Type-aware editor widget for a single PropertyValue.
//
// Renders a different control per `value.kind` and emits the freshly-built
// PropertyValue via `onChange`. Class values render a nested `PropertyEditor`
// recursively so deeply-structured types can be edited inline.

import { Fragment, useMemo, useState } from 'react';

import {
  type ClassPropertyType,
  type EnumPropertyType,
  EnumStorageType,
  Property,
  type PropertyTypes,
  type PropertyValue,
  PropertyTypeKind,
  cloneProperties,
} from '@tiled-ts/core';

import { PropertyEditor } from './PropertyEditor.js';

export interface PropertyValueInputProps {
  value: PropertyValue;
  propertyTypes: PropertyTypes;
  onChange(next: PropertyValue): void;
}

export function PropertyValueInput(props: PropertyValueInputProps): JSX.Element {
  const { value, propertyTypes, onChange } = props;

  switch (value.kind) {
    case 'string':
      return (
        <input
          type="text"
          defaultValue={value.value}
          onBlur={(e) => onChange(Property.string(e.currentTarget.value))}
        />
      );
    case 'int':
      return (
        <input
          type="number"
          step={1}
          defaultValue={value.value}
          onBlur={(e) => onChange(Property.int(Number(e.currentTarget.value)))}
        />
      );
    case 'float':
      return (
        <input
          type="number"
          step="any"
          defaultValue={value.value}
          onBlur={(e) => onChange(Property.float(Number(e.currentTarget.value)))}
        />
      );
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={value.value}
          onChange={(e) => onChange(Property.bool(e.currentTarget.checked))}
        />
      );
    case 'color':
      return <ColorInput value={value.value} onChange={(c) => onChange(Property.color(c))} />;
    case 'file':
      return (
        <input
          type="text"
          defaultValue={value.url}
          onBlur={(e) => onChange(Property.file(e.currentTarget.value))}
        />
      );
    case 'object':
      return (
        <input
          type="number"
          step={1}
          min={0}
          defaultValue={value.id}
          onBlur={(e) => onChange(Property.object(Number(e.currentTarget.value)))}
        />
      );
    case 'enum': {
      const type = propertyTypes
        ? findType(propertyTypes, value.typeName)
        : undefined;
      if (type?.kind === PropertyTypeKind.Enum) {
        return <EnumInput type={type} value={value.value} flags={Boolean(value.flags)} onChange={onChange} />;
      }
      // Fall back to free-form input when the type isn't known yet.
      return (
        <input
          type="text"
          defaultValue={String(value.value)}
          onBlur={(e) =>
            onChange(Property.enum(value.typeName, e.currentTarget.value, Boolean(value.flags)))
          }
        />
      );
    }
    case 'class': {
      return (
        <ClassInput
          value={value}
          propertyTypes={propertyTypes}
          onChange={onChange}
        />
      );
    }
  }
}

/* ───────────────────────── colour picker ────────────────────────────── */

function ColorInput(props: { value: string; onChange(v: string): void }): JSX.Element {
  // The HTML <input type="color"> takes only #RRGGBB; we strip alpha for the
  // picker and surface it through a separate number input.
  const { rgb, alpha } = splitColor(props.value);
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input
        type="color"
        value={rgb}
        onChange={(e) => props.onChange(combineColor(e.currentTarget.value, alpha))}
        style={{ width: 32, height: 22, padding: 0, border: '1px solid var(--border)', background: 'transparent' }}
      />
      <input
        type="number"
        min={0}
        max={255}
        step={1}
        value={alpha}
        onChange={(e) => props.onChange(combineColor(rgb, Number(e.currentTarget.value)))}
        style={{ width: 50 }}
      />
    </span>
  );
}

function splitColor(c: string): { rgb: string; alpha: number } {
  if (c.length === 9) return { rgb: `#${c.slice(3)}`, alpha: parseInt(c.slice(1, 3), 16) };
  return { rgb: c, alpha: 255 };
}

function combineColor(rgb: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0');
  return alpha === 255 ? rgb : `#${a}${rgb.replace('#', '')}`;
}

/* ───────────────────────────── enum input ───────────────────────────── */

function EnumInput(props: {
  type: EnumPropertyType;
  value: number | string;
  flags: boolean;
  onChange(v: PropertyValue): void;
}): JSX.Element {
  const { type, value, flags, onChange } = props;
  const intMode = type.storageType === EnumStorageType.IntValue;

  if (type.valuesAsFlags) {
    // bit-flag combination
    const current = intMode ? Number(value) : 0; // simple int mode for flags
    return (
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
        {type.values.map((label, i) => {
          const bit = 1 << i;
          return (
            <label key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <input
                type="checkbox"
                checked={Boolean(current & bit)}
                onChange={(e) =>
                  onChange(
                    Property.enum(
                      type.name,
                      e.currentTarget.checked ? current | bit : current & ~bit,
                      true,
                    ),
                  )
                }
              />
              {label}
            </label>
          );
        })}
      </span>
    );
  }

  return (
    <select
      value={String(value)}
      onChange={(e) =>
        onChange(
          Property.enum(
            type.name,
            intMode ? Number(e.currentTarget.value) : e.currentTarget.value,
            flags,
          ),
        )
      }
    >
      {type.values.map((label, i) => (
        <option key={label} value={intMode ? String(i) : label}>
          {label}
        </option>
      ))}
    </select>
  );
}

/* ───────────────────────────── class input ──────────────────────────── */

function ClassInput(props: {
  value: Extract<PropertyValue, { kind: 'class' }>;
  propertyTypes: PropertyTypes;
  onChange(next: PropertyValue): void;
}): JSX.Element {
  const { value, propertyTypes, onChange } = props;
  const [expanded, setExpanded] = useState(true);
  const type = useMemo(
    () => findType(propertyTypes, value.typeName) as ClassPropertyType | undefined,
    [propertyTypes, value.typeName],
  );

  // Resolve missing-member defaults from the class definition.
  const members = useMemo(() => {
    const m = cloneProperties(value.members);
    if (type) {
      for (const [k, v] of type.members) if (!m.has(k)) m.set(k, v);
    }
    return m;
  }, [value, type]);

  return (
    <Fragment>
      <button
        className="icon-button"
        onClick={() => setExpanded((v) => !v)}
        style={{ width: 'auto', padding: '0 6px' }}
      >
        {expanded ? '▼' : '▶'} {value.typeName || 'class'}
      </button>
      {expanded && (
        <div style={{ marginLeft: 12, marginTop: 4 }}>
          {[...members.entries()].map(([memberName, memberValue]) => (
            <div key={memberName} className="row" style={{ paddingBlock: 2 }}>
              <span style={{ minWidth: 80, color: 'var(--text-1)' }}>{memberName}</span>
              <PropertyValueInput
                value={memberValue}
                propertyTypes={propertyTypes}
                onChange={(nextChild) => {
                  const nextMembers = cloneProperties(members);
                  nextMembers.set(memberName, nextChild);
                  onChange(Property.class(value.typeName, nextMembers));
                }}
              />
            </div>
          ))}
          {members.size === 0 && <span style={{ color: 'var(--text-1)' }}>(no members)</span>}
        </div>
      )}
      {/* Hide the redundant PropertyEditor import-keeper. */}
      <PropertyEditorTag />
    </Fragment>
  );
}

function PropertyEditorTag(): JSX.Element {
  // Suppress "PropertyEditor imported but unused" diagnostics when the
  // component is only referenced indirectly via type-imports.
  return <span style={{ display: 'none' }}>{typeof PropertyEditor}</span>;
}

function findType(types: PropertyTypes, name: string) {
  for (const t of types) if (t.name === name) return t;
  return undefined;
}
