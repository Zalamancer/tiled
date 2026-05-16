import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import {
  Map as TiledMap,
  MapObject,
  MapObjectShape,
  ObjectGroup,
  PropertyTypes,
  Tileset,
} from '@tiled-ts/core';

import { useEditor } from '../src/state/editorStore.js';
import { TileAnimationEditor } from '../src/components/TileAnimationEditor.js';
import { TileCollisionEditor } from '../src/components/TileCollisionEditor.js';

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

function mount(): { tileset: Tileset; map: TiledMap } {
  const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('t', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  useEditor.getState().addMap(map);
  return { tileset: ts, map };
}

describe('TileAnimationEditor', () => {
  it('renders the empty state', () => {
    const { tileset } = mount();
    render(
      <TileAnimationEditor
        tile={tileset.findTile(0)!}
        tileset={tileset}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Animation — Tile 0/)).toBeTruthy();
    expect(screen.getByText(/No frames/)).toBeTruthy();
    expect(screen.getByText('+ Add frame')).toBeTruthy();
  });

  it('+ Add frame appends a frame row', () => {
    const { tileset } = mount();
    render(
      <TileAnimationEditor
        tile={tileset.findTile(0)!}
        tileset={tileset}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('+ Add frame'));
    expect(screen.getAllByText('Tile').length).toBe(1);
  });

  it('Apply pushes one undo entry with the new frames', () => {
    const { tileset } = mount();
    const tile = tileset.findTile(0)!;
    const doc = useEditor.getState().docs[useEditor.getState().activeDocIndex]!;
    render(
      <TileAnimationEditor tile={tile} tileset={tileset} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByText('+ Add frame'));
    fireEvent.click(screen.getByText('+ Add frame'));
    fireEvent.click(screen.getByText('Apply'));
    expect(doc.undoStack.count()).toBe(1);
    expect(tile.frames).toHaveLength(2);
  });
});

describe('TileCollisionEditor', () => {
  it('renders with no collision shapes by default', () => {
    const { tileset } = mount();
    render(<TileCollisionEditor tile={tileset.findTile(0)!} onClose={() => {}} />);
    expect(screen.getByText(/Collision — Tile 0/)).toBeTruthy();
    expect(screen.getByText(/No collision shapes/)).toBeTruthy();
  });

  it('Add buttons append shapes to the working ObjectGroup', () => {
    const { tileset } = mount();
    const tile = tileset.findTile(0)!;
    render(<TileCollisionEditor tile={tile} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Rect'));
    fireEvent.click(screen.getByText('Ellipse'));
    // Each row shows a numeric input for x (and y / w / h for non-points).
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThanOrEqual(4); // at least one shape's xy
  });

  it('Apply commits a ChangeTileObjectGroup and undoes', () => {
    const { tileset } = mount();
    const tile = tileset.findTile(0)!;
    const doc = useEditor.getState().docs[useEditor.getState().activeDocIndex]!;
    render(<TileCollisionEditor tile={tile} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Rect'));
    fireEvent.click(screen.getByText('Apply'));
    expect(doc.undoStack.count()).toBe(1);
    expect(tile.objectGroup?.objectCount()).toBe(1);
    doc.undoStack.undo();
    expect(tile.objectGroup).toBeUndefined();
  });

  it('removes a shape on ✕', () => {
    const { tileset } = mount();
    const tile = tileset.findTile(0)!;
    const og = new ObjectGroup('c');
    const mo = new MapObject('rect', '', { x: 0, y: 0 }, { width: 8, height: 8 });
    mo.setShape(MapObjectShape.Rectangle);
    og.addObject(mo);
    tile.objectGroup = og.clone() as ObjectGroup;

    render(<TileCollisionEditor tile={tile} onClose={() => {}} />);
    // The single delete-shape button shows ✕.
    const removeButtons = screen.getAllByText('✕');
    expect(removeButtons.length).toBeGreaterThan(0);
    fireEvent.click(removeButtons[0]!);
    expect(screen.getByText(/No collision shapes/)).toBeTruthy();
  });
});
