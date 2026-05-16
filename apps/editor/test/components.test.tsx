import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Map as TiledMap, TileLayer, Tileset } from '@tiled-ts/core';

import { useEditor } from '../src/state/editorStore.js';
import { Toolbar } from '../src/components/Toolbar.js';
import { StatusBar } from '../src/components/StatusBar.js';
import { MapTabs } from '../src/components/MapTabs.js';
import { ToolPalette } from '../src/components/ToolPalette.js';
import { LayerDock } from '../src/docks/LayerDock.js';
import { TilesetDock } from '../src/docks/TilesetDock.js';
import { UndoDock } from '../src/docks/UndoDock.js';
import { PropertiesDock } from '../src/docks/PropertiesDock.js';

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

function mountSampleMap(): { map: TiledMap; tl: TileLayer; ts: Tileset } {
  const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('terrain', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  const tl = new TileLayer('main', 0, 0, 4, 4);
  map.addLayer(tl);
  useEditor.getState().addMap(map);
  return { map, tl, ts };
}

describe('Toolbar', () => {
  it('exposes New / Open / Save / Undo / Redo', () => {
    render(<Toolbar />);
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.getByText('Redo')).toBeTruthy();
  });
});

describe('StatusBar', () => {
  it('shows "No map open" initially', () => {
    render(<StatusBar />);
    expect(screen.getByText('No map open')).toBeTruthy();
  });

  it('reflects an open map', () => {
    mountSampleMap();
    render(<StatusBar />);
    expect(screen.getByText('4×4 (16×16)')).toBeTruthy();
  });
});

describe('MapTabs', () => {
  it('renders one tab per open map', () => {
    mountSampleMap();
    render(<MapTabs />);
    expect(screen.getByText(/Untitled/)).toBeTruthy();
  });
});

describe('ToolPalette', () => {
  it('lists every registered tool', () => {
    render(<ToolPalette />);
    expect(screen.getByText('Stamp Brush')).toBeTruthy();
    expect(screen.getByText('Bucket Fill')).toBeTruthy();
    expect(screen.getByText('Insert Polygon')).toBeTruthy();
  });
});

describe('LayerDock', () => {
  it('shows existing layers', () => {
    const { tl } = mountSampleMap();
    render(<LayerDock />);
    expect(screen.getByDisplayValue(tl.name)).toBeTruthy();
  });
});

describe('TilesetDock', () => {
  it('lists tilesets in the active map', () => {
    mountSampleMap();
    render(<TilesetDock />);
    expect(screen.getByText('terrain')).toBeTruthy();
  });
});

describe('UndoDock', () => {
  it('shows the empty (clean) state when nothing happened', () => {
    mountSampleMap();
    render(<UndoDock />);
    expect(screen.getByText('(clean)')).toBeTruthy();
  });
});

describe('PropertiesDock', () => {
  it('shows the current layer as the target when one is selected', () => {
    mountSampleMap();
    render(<PropertiesDock />);
    expect(screen.getByText(/Properties — Layer/)).toBeTruthy();
  });
});
