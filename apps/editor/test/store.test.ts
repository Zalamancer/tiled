import { describe, expect, it } from 'vitest';

import { Map as TiledMap, TileLayer, Tileset } from '@tiled-ts/core';

import { useEditor, REGISTERED_TOOLS } from '../src/state/editorStore.js';

describe('editor store', () => {
  it('starts empty', () => {
    const s = useEditor.getState();
    expect(s.docs).toEqual([]);
    expect(s.activeDocIndex).toBe(-1);
    expect(s.activeTool).toBeNull();
  });

  it('addMap creates a MapDocument and selects it', () => {
    const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
    useEditor.getState().addMap(map);
    const s = useEditor.getState();
    expect(s.docs.length).toBe(1);
    expect(s.docs[0]!.map).toBe(map);
    expect(s.activeDocIndex).toBe(0);
  });

  it('setActiveTool instantiates the chosen Tool', () => {
    const setActiveTool = useEditor.getState().setActiveTool;
    for (const entry of REGISTERED_TOOLS) {
      setActiveTool(entry.id);
      const tool = useEditor.getState().activeTool;
      expect(tool?.id).toBe(entry.factory().id);
    }
  });

  it('closeMap removes the document and rotates the active index', () => {
    const m1 = new TiledMap();
    const m2 = new TiledMap();
    const store = useEditor.getState();
    store.addMap(m1);
    store.addMap(m2);
    expect(useEditor.getState().docs.length).toBeGreaterThanOrEqual(2);
    const before = useEditor.getState().docs.length;
    useEditor.getState().closeMap(0);
    expect(useEditor.getState().docs.length).toBe(before - 1);
  });

  it('invalidate bumps the version', () => {
    const v0 = useEditor.getState().version;
    useEditor.getState().invalidate();
    expect(useEditor.getState().version).toBeGreaterThan(v0);
  });

  it('selectLayer routes through MapDocument', () => {
    useEditor.setState({ docs: [], activeDocIndex: -1 });
    const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
    const tl = new TileLayer('tl', 0, 0, 4, 4);
    map.addLayer(tl);
    map.addTileset(new Tileset('t', 16, 16));
    useEditor.getState().addMap(map);
    useEditor.getState().selectLayer(tl);
    const doc = useEditor.getState().docs[useEditor.getState().activeDocIndex]!;
    expect(doc.currentLayer()).toBe(tl);
  });
});
