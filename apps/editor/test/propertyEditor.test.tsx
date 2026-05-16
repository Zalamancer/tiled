import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import {
  Map as TiledMap,
  Property,
  PropertyTypes,
  PropertyTypeKind,
  createClassType,
  createEnumType,
} from '@tiled-ts/core';
import { MapDocument } from '@tiled-ts/commands';

import { useEditor } from '../src/state/editorStore.js';
import { PropertyEditor } from '../src/components/PropertyEditor.js';
import { PropertyValueInput } from '../src/components/PropertyValueInput.js';
import { ObjectTypesEditor } from '../src/components/ObjectTypesEditor.js';

beforeEach(() => {
  useEditor.setState({
    docs: [],
    activeDocIndex: -1,
    activeTool: null,
    activeToolId: 'stamp',
    stamp: null,
    selectedTile: null,
    selectedTileset: null,
    propertyTypes: new PropertyTypes(),
    version: 0,
  });
});

afterEach(() => cleanup());

function makeDoc(): MapDocument {
  return new MapDocument(new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 }));
}

describe('PropertyValueInput', () => {
  it('renders correct controls per kind', () => {
    const types = new PropertyTypes();
    const { rerender } = render(
      <PropertyValueInput value={Property.bool(true)} propertyTypes={types} onChange={() => {}} />,
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);

    rerender(
      <PropertyValueInput value={Property.int(42)} propertyTypes={types} onChange={() => {}} />,
    );
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('42');

    rerender(
      <PropertyValueInput value={Property.string('hi')} propertyTypes={types} onChange={() => {}} />,
    );
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('hi');
  });

  it('enum input lists every defined value', () => {
    const types = new PropertyTypes();
    types.add(createEnumType('Mood', ['Happy', 'Sad', 'Angry']));
    render(
      <PropertyValueInput
        value={Property.enum('Mood', 'Happy')}
        propertyTypes={types}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Happy')).toBeTruthy();
    expect(screen.getByText('Sad')).toBeTruthy();
    expect(screen.getByText('Angry')).toBeTruthy();
  });

  it('class input renders one row per member', () => {
    const types = new PropertyTypes();
    const cls = createClassType('Stat', {
      members: new Map([['hp', Property.int(10)], ['mp', Property.int(5)]]),
    });
    types.add(cls);
    render(
      <PropertyValueInput
        value={Property.class('Stat', cls.members)}
        propertyTypes={types}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('hp')).toBeTruthy();
    expect(screen.getByText('mp')).toBeTruthy();
  });
});

describe('PropertyEditor', () => {
  it('shows "No custom properties" for an empty target', () => {
    const doc = makeDoc();
    const types = new PropertyTypes();
    render(<PropertyEditor doc={doc} target={doc.map} propertyTypes={types} />);
    expect(screen.getByText(/No custom properties/)).toBeTruthy();
  });

  it('lists existing properties', () => {
    const doc = makeDoc();
    doc.map.setProperty('label', Property.string('intro'));
    doc.map.setProperty('flag', Property.bool(false));
    const types = new PropertyTypes();
    render(<PropertyEditor doc={doc} target={doc.map} propertyTypes={types} />);
    expect(screen.getByDisplayValue('label')).toBeTruthy();
    expect(screen.getByDisplayValue('flag')).toBeTruthy();
  });

  it('opens the add-property row when "+ Add property" clicked', () => {
    const doc = makeDoc();
    const types = new PropertyTypes();
    render(<PropertyEditor doc={doc} target={doc.map} propertyTypes={types} />);
    fireEvent.click(screen.getByText('+ Add property'));
    expect(screen.getByPlaceholderText('Name')).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
  });
});

describe('ObjectTypesEditor', () => {
  it('renders the management dialog with class + enum buttons', () => {
    render(<ObjectTypesEditor onClose={() => {}} />);
    expect(screen.getByText(/Custom Types/)).toBeTruthy();
    expect(screen.getByText('+ Class')).toBeTruthy();
    expect(screen.getByText('+ Enum')).toBeTruthy();
  });

  it('+ Class adds a new ClassPropertyType to the store', () => {
    render(<ObjectTypesEditor onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ Class'));
    const types = useEditor.getState().propertyTypes;
    const list = [...types];
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe(PropertyTypeKind.Class);
  });

  it('+ Enum adds a new EnumPropertyType', () => {
    render(<ObjectTypesEditor onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ Enum'));
    const list = [...useEditor.getState().propertyTypes];
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe(PropertyTypeKind.Enum);
  });
});
