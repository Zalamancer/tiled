// Modal dialog managing the project-wide `PropertyTypes` collection.
//
// Two-pane layout:
//   - Left: the list of types (classes + enums) with add/remove buttons.
//   - Right: detail editor for the selected type — members for classes,
//     value list for enums.
//
// All mutations go through the shared `PropertyTypes` instance (held in the
// editor store), so every open property editor live-updates.

import { useState } from 'react';

import {
  EnumStorageType,
  Property,
  PropertyTypeKind,
  createClassType,
  createEnumType,
  type ClassPropertyType,
  type EnumPropertyType,
  type PropertyTypes,
} from '@tiled-ts/core';

import { useEditor } from '../state/editorStore.js';
import { PropertyValueInput } from './PropertyValueInput.js';

export interface ObjectTypesEditorProps {
  onClose(): void;
}

export function ObjectTypesEditor(props: ObjectTypesEditorProps): JSX.Element {
  const types = useEditor((s) => s.propertyTypes);
  const invalidate = useEditor((s) => s.invalidate);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const list = [...types];
  const selected = list.find((t) => t.id === selectedId) ?? list[0];

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed',
        inset: '10%',
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 32px rgba(0,0,0,.4)',
      }}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
        <strong>Custom Types</strong>
        <span style={{ flex: 1 }} />
        <button onClick={props.onClose}>Close</button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          style={{
            width: 220,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
            {list.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`layer-row ${selected === t ? 'active' : ''}`}
              >
                <span style={{ width: 50, color: 'var(--text-1)' }}>
                  {t.kind === PropertyTypeKind.Class ? 'class' : 'enum'}
                </span>
                <span style={{ flex: 1 }}>{t.name}</span>
                <button
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const idx = types.findIndexByName(t.name);
                    if (idx >= 0) types.removeAt(idx);
                    invalidate();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {list.length === 0 && <div style={{ color: 'var(--text-1)' }}>No custom types yet.</div>}
          </div>
          <div style={{ padding: 6, display: 'flex', gap: 4, borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => {
                const c = createClassType(uniqueName(types, 'NewClass'));
                types.add(c);
                setSelectedId(c.id);
                invalidate();
              }}
            >
              + Class
            </button>
            <button
              onClick={() => {
                const e = createEnumType(uniqueName(types, 'NewEnum'), ['A', 'B']);
                types.add(e);
                setSelectedId(e.id);
                invalidate();
              }}
            >
              + Enum
            </button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 12, overflow: 'auto' }}>
          {!selected && <div style={{ color: 'var(--text-1)' }}>Select a type to edit.</div>}
          {selected?.kind === PropertyTypeKind.Class && (
            <ClassDetail type={selected} types={types} invalidate={invalidate} />
          )}
          {selected?.kind === PropertyTypeKind.Enum && (
            <EnumDetail type={selected} invalidate={invalidate} />
          )}
        </div>
      </div>
    </div>
  );
}

function ClassDetail({
  type,
  types,
  invalidate,
}: {
  type: ClassPropertyType;
  types: PropertyTypes;
  invalidate(): void;
}): JSX.Element {
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ minWidth: 80, color: 'var(--text-1)' }}>Name</span>
        <input
          type="text"
          defaultValue={type.name}
          onBlur={(e) => {
            type.name = e.currentTarget.value;
            invalidate();
          }}
          style={{ flex: 1 }}
        />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ minWidth: 80, color: 'var(--text-1)' }}>Color</span>
        <input
          type="color"
          value={type.color.length === 7 ? type.color : '#808080'}
          onChange={(e) => {
            type.color = e.currentTarget.value;
            invalidate();
          }}
        />
      </div>
      <div style={{ marginBlock: 8, color: 'var(--text-1)' }}>Members</div>
      {[...type.members.entries()].map(([memberName, value]) => (
        <div key={memberName} className="row" style={{ paddingBlock: 2 }}>
          <input
            type="text"
            defaultValue={memberName}
            onBlur={(e) => {
              const newName = e.currentTarget.value;
              if (!newName || newName === memberName) return;
              const v = type.members.get(memberName);
              if (v) {
                type.members.delete(memberName);
                type.members.set(newName, v);
                invalidate();
              }
            }}
            style={{ width: 110 }}
          />
          <span style={{ flex: 1, display: 'flex' }}>
            <PropertyValueInput
              value={value}
              propertyTypes={types}
              onChange={(next) => {
                type.members.set(memberName, next);
                invalidate();
              }}
            />
          </span>
          <button
            className="icon-button"
            onClick={() => {
              type.members.delete(memberName);
              invalidate();
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        <button
          onClick={() => {
            type.members.set(
              uniqueMemberName(type, 'member'),
              Property.string(''),
            );
            invalidate();
          }}
        >
          + Member
        </button>
      </div>
    </div>
  );
}

function EnumDetail({
  type,
  invalidate,
}: {
  type: EnumPropertyType;
  invalidate(): void;
}): JSX.Element {
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ minWidth: 80, color: 'var(--text-1)' }}>Name</span>
        <input
          type="text"
          defaultValue={type.name}
          onBlur={(e) => {
            type.name = e.currentTarget.value;
            invalidate();
          }}
          style={{ flex: 1 }}
        />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ minWidth: 80, color: 'var(--text-1)' }}>Storage</span>
        <select
          value={type.storageType === EnumStorageType.IntValue ? 'int' : 'string'}
          onChange={(e) => {
            type.storageType =
              e.currentTarget.value === 'int' ? EnumStorageType.IntValue : EnumStorageType.StringValue;
            invalidate();
          }}
        >
          <option value="string">string</option>
          <option value="int">int</option>
        </select>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ minWidth: 80, color: 'var(--text-1)' }}>Flags</span>
        <input
          type="checkbox"
          checked={type.valuesAsFlags}
          onChange={(e) => {
            type.valuesAsFlags = e.currentTarget.checked;
            invalidate();
          }}
        />
      </div>
      <div style={{ marginBlock: 8, color: 'var(--text-1)' }}>Values</div>
      {type.values.map((v, i) => (
        <div key={i} className="row" style={{ paddingBlock: 2 }}>
          <input
            type="text"
            defaultValue={v}
            onBlur={(e) => {
              type.values[i] = e.currentTarget.value;
              invalidate();
            }}
            style={{ flex: 1 }}
          />
          <button
            className="icon-button"
            onClick={() => {
              type.values.splice(i, 1);
              invalidate();
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        <button
          onClick={() => {
            type.values.push(`Value${type.values.length}`);
            invalidate();
          }}
        >
          + Value
        </button>
      </div>
    </div>
  );
}

function uniqueName(types: PropertyTypes, base: string): string {
  let n = base;
  let i = 1;
  while ([...types].some((t) => t.name === n)) {
    n = `${base}${i++}`;
  }
  return n;
}

function uniqueMemberName(type: ClassPropertyType, base: string): string {
  let n = base;
  let i = 1;
  while (type.members.has(n)) {
    n = `${base}${i++}`;
  }
  return n;
}
