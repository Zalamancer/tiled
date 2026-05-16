// Editable property bag for a single TiledObject.
//
// Renders one row per property with a type-aware `PropertyValueInput`,
// supports rename / remove, and provides a popover to add a new property
// of any built-in or user-defined type.

import { useState } from 'react';

import {
  Property,
  type PropertyTypes,
  type PropertyValue,
  type TiledObject,
  defaultValueForType,
  PropertyTypeKind,
} from '@tiled-ts/core';
import { RemoveProperty, RenameProperty, SetProperty, type MapDocument } from '@tiled-ts/commands';

import { PropertyValueInput } from './PropertyValueInput.js';

export interface PropertyEditorProps {
  doc: MapDocument;
  target: TiledObject;
  propertyTypes: PropertyTypes;
}

export function PropertyEditor(props: PropertyEditorProps): JSX.Element {
  const { doc, target, propertyTypes } = props;
  const [adding, setAdding] = useState(false);
  const entries = [...target.properties.entries()];

  return (
    <div>
      {entries.length === 0 && !adding && (
        <div style={{ color: 'var(--text-1)' }}>No custom properties.</div>
      )}
      {entries.map(([name, value]) => (
        <PropertyRow
          key={name}
          name={name}
          value={value}
          propertyTypes={propertyTypes}
          onValue={(next) => doc.undoStack.push(new SetProperty(doc, target, name, next))}
          onRemove={() => doc.undoStack.push(new RemoveProperty(doc, target, name))}
          onRename={(newName) => {
            if (newName && newName !== name && !target.hasProperty(newName)) {
              doc.undoStack.push(new RenameProperty(doc, target, name, newName));
            }
          }}
        />
      ))}
      <div style={{ marginTop: 6 }}>
        {!adding ? (
          <button onClick={() => setAdding(true)}>+ Add property</button>
        ) : (
          <AddPropertyRow
            propertyTypes={propertyTypes}
            onCancel={() => setAdding(false)}
            onAdd={(name, value) => {
              if (!target.hasProperty(name)) {
                doc.undoStack.push(new SetProperty(doc, target, name, value));
              }
              setAdding(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface PropertyRowProps {
  name: string;
  value: PropertyValue;
  propertyTypes: PropertyTypes;
  onValue(next: PropertyValue): void;
  onRemove(): void;
  onRename(newName: string): void;
}

function PropertyRow(props: PropertyRowProps): JSX.Element {
  return (
    <div className="row" style={{ paddingBlock: 2 }}>
      <input
        type="text"
        defaultValue={props.name}
        onBlur={(e) => props.onRename(e.currentTarget.value)}
        style={{ minWidth: 100, flex: '0 0 100px' }}
      />
      <span style={{ flex: 1, display: 'flex' }}>
        <PropertyValueInput
          value={props.value}
          propertyTypes={props.propertyTypes}
          onChange={props.onValue}
        />
      </span>
      <button className="icon-button" onClick={props.onRemove} title="Remove">
        ✕
      </button>
    </div>
  );
}

const BUILTIN_KINDS: { kind: string; label: string; make(): PropertyValue }[] = [
  { kind: 'string', label: 'string', make: () => Property.string('') },
  { kind: 'int', label: 'int', make: () => Property.int(0) },
  { kind: 'float', label: 'float', make: () => Property.float(0) },
  { kind: 'bool', label: 'bool', make: () => Property.bool(false) },
  { kind: 'color', label: 'color', make: () => Property.color('#000000') },
  { kind: 'file', label: 'file', make: () => Property.file('') },
  { kind: 'object', label: 'object', make: () => Property.object(0) },
];

function AddPropertyRow(props: {
  propertyTypes: PropertyTypes;
  onCancel(): void;
  onAdd(name: string, value: PropertyValue): void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('string');
  const userTypes = [...props.propertyTypes];

  const commit = () => {
    if (!name) {
      props.onCancel();
      return;
    }
    const builtin = BUILTIN_KINDS.find((b) => b.kind === kind);
    if (builtin) {
      props.onAdd(name, builtin.make());
      return;
    }
    const utype = userTypes.find((t) => t.name === kind);
    if (utype) props.onAdd(name, defaultValueForType(utype));
  };

  return (
    <div className="row">
      <input
        type="text"
        autoFocus
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') props.onCancel();
        }}
        style={{ flex: 1 }}
      />
      <select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
        {BUILTIN_KINDS.map((b) => (
          <option key={b.kind} value={b.kind}>
            {b.label}
          </option>
        ))}
        {userTypes.length > 0 && <option disabled>──────</option>}
        {userTypes.map((t) => (
          <option key={t.id} value={t.name}>
            {t.kind === PropertyTypeKind.Enum ? 'enum: ' : 'class: '}
            {t.name}
          </option>
        ))}
      </select>
      <button onClick={commit}>Add</button>
      <button onClick={props.onCancel}>Cancel</button>
    </div>
  );
}
