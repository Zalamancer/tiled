import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import React from 'react';

import { readMapJson } from '@tiled-ts/format';
import { LayerDock } from '../src/docks/LayerDock.js';
import { MinimapDock } from '../src/docks/MinimapDock.js';
import { PropertiesDock } from '../src/docks/PropertiesDock.js';
import { TilesetDock } from '../src/docks/TilesetDock.js';
import { MapTabs } from '../src/components/MapTabs.js';
import { StatusBar } from '../src/components/StatusBar.js';
import { useEditor } from '../src/state/editorStore.js';

beforeEach(() => {
  useEditor.setState({
    docs: [],
    activeDocIndex: -1,
    activeTool: null,
    activeToolId: 'stamp',
    stamp: null,
    selectedTile: null,
    selectedTileset: null,
    version: 0,
  });
});

afterEach(() => cleanup());

function autumnFieldsPath(): string {
  return resolve(__dirname, '../public/demos/seasons__Autumn Fields.tmj');
}

describe('bundled demo assets', () => {
  it('preserves Tiled layer visibility for Autumn Fields', () => {
    const map = JSON.parse(readFileSync(autumnFieldsPath(), 'utf8')) as {
      layers: Array<{ name: string; visible?: boolean }>;
    };

    const visibleByName = new Map(map.layers.map((layer) => [layer.name, layer.visible !== false]));

    expect(visibleByName.get('Ground')).toBe(true);
    expect(visibleByName.get('Road')).toBe(true);
    expect(visibleByName.get('Farm Fields')).toBe(true);
    expect(visibleByName.get('Leaves')).toBe(true);
    expect(visibleByName.get('Fence')).toBe(true);
    expect(visibleByName.get('Tall Grass')).toBe(true);
    expect(visibleByName.get('RockSlopes1Gray')).toBe(false);
  });

  it('renders the Autumn Fields editor docks', () => {
    const map = readMapJson(JSON.parse(readFileSync(autumnFieldsPath(), 'utf8')));
    map.fileName = 'Autumn Fields.tmj';
    useEditor.getState().addMap(map);

    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(MapTabs),
        React.createElement(LayerDock),
        React.createElement(TilesetDock),
        React.createElement(PropertiesDock),
        React.createElement(MinimapDock),
        React.createElement(StatusBar),
      ),
    );

    expect(screen.getAllByText('Autumn Fields.tmj')).toHaveLength(2);
    expect(screen.getByDisplayValue('Road')).toBeTruthy();
    expect(screen.getByText('Tileset_Road')).toBeTruthy();
    expect(screen.getByText('56×50 (16×16)')).toBeTruthy();
  });
});
