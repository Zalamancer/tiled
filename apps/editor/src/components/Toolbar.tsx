// Top toolbar — file ops + zoom + active map name.

import { useState } from 'react';

import { useActiveDoc, useEditor } from '../state/editorStore.js';
import { Map as TiledMap, LayerDataFormat } from '@tiled-ts/core';
import { readMapJson, writeMapJson } from '@tiled-ts/format';
import { ObjectTypesEditor } from './ObjectTypesEditor.js';

export function Toolbar(): JSX.Element {
  const addMap = useEditor((s) => s.addMap);
  const doc = useActiveDoc();
  const [showTypes, setShowTypes] = useState(false);

  const onNew = () => {
    const map = new TiledMap({
      width: 32,
      height: 24,
      tileWidth: 16,
      tileHeight: 16,
    });
    map.setLayerDataFormat(LayerDataFormat.Base64Zlib);
    addMap(map);
  };

  const onOpen = async () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tmj,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const map = readMapJson(JSON.parse(text));
        map.fileName = file.name;
        addMap(map);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to open map:', e);
      }
    };
    input.click();
  };

  const onSave = () => {
    if (!doc || typeof document === 'undefined') return;
    const json = writeMapJson(doc.map);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = doc.map.fileName || 'untitled.tmj';
    a.click();
  };

  const onUndo = () => doc?.undoStack.undo();
  const onRedo = () => doc?.undoStack.redo();

  return (
    <div className="toolbar">
      <button onClick={onNew}>New</button>
      <button onClick={onOpen}>Open</button>
      <button onClick={onSave} disabled={!doc}>Save</button>
      <span style={{ width: 12 }} />
      <button onClick={onUndo} disabled={!doc?.undoStack.canUndo()}>Undo</button>
      <button onClick={onRedo} disabled={!doc?.undoStack.canRedo()}>Redo</button>
      <span style={{ width: 12 }} />
      <button onClick={() => setShowTypes(true)}>Custom Types…</button>
      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-1)' }}>
        {doc?.map.fileName || (doc ? 'Untitled' : 'No map open')}
      </span>
      {showTypes && <ObjectTypesEditor onClose={() => setShowTypes(false)} />}
    </div>
  );
}
