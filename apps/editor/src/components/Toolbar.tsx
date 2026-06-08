// Top toolbar — file ops + zoom + active map name.

import { useEffect, useState } from 'react';

import { useActiveDoc, useEditor } from '../state/editorStore.js';
import { Map as TiledMap, LayerDataFormat } from '@tiled-ts/core';
import { readMapJson, writeMapJson } from '@tiled-ts/format';
import { ObjectTypesEditor } from './ObjectTypesEditor.js';

interface DemoEntry {
  id: string;
  title: string;
  src: string;
  category?: string;
}

export function Toolbar(): JSX.Element {
  const addMap = useEditor((s) => s.addMap);
  const doc = useActiveDoc();
  const [showTypes, setShowTypes] = useState(false);
  const [demos, setDemos] = useState<DemoEntry[]>([]);
  const [showDemos, setShowDemos] = useState(false);

  useEffect(() => {
    if (typeof fetch !== 'function') return;
    fetch('./demos/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: DemoEntry[]) => setDemos(list))
      .catch(() => setDemos([]));
  }, []);

  const openDemo = async (entry: DemoEntry) => {
    try {
      const r = await fetch(entry.src);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const map = readMapJson(await r.json());
      map.fileName = `${entry.title}.tmj`;
      addMap(map);
      setShowDemos(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to open demo:', e);
    }
  };

  const openAllDemos = async () => {
    for (const d of demos) await openDemo(d);
    setShowDemos(false);
  };

  const openCategory = async (cat: string) => {
    for (const d of demos.filter((x) => x.category === cat)) await openDemo(d);
    setShowDemos(false);
  };

  // Group demos by category preserving the order they appear in index.json.
  const groupedDemos: { category: string; entries: DemoEntry[] }[] = [];
  for (const d of demos) {
    const cat = d.category ?? 'Other';
    let group = groupedDemos.find((g) => g.category === cat);
    if (!group) {
      group = { category: cat, entries: [] };
      groupedDemos.push(group);
    }
    group.entries.push(d);
  }

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
      <span style={{ width: 12 }} />
      <span style={{ position: 'relative' }}>
        <button onClick={() => setShowDemos((v) => !v)} disabled={demos.length === 0}>
          Demos ▾ {demos.length > 0 ? `(${demos.length})` : ''}
        </button>
        {showDemos && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              maxHeight: 480,
              overflow: 'auto',
              zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,.35)',
              minWidth: 260,
            }}
          >
            <div
              onClick={openAllDemos}
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--accent)',
              }}
            >
              ✨ Open all {demos.length}
            </div>
            {groupedDemos.map((g) => (
              <div key={g.category}>
                <div
                  onClick={() => openCategory(g.category)}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--bg-2)',
                    color: 'var(--text-1)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--border)',
                  }}
                  title={`Open all ${g.entries.length}`}
                >
                  <span>{g.category}</span>
                  <span style={{ color: 'var(--accent)' }}>+ {g.entries.length}</span>
                </div>
                {g.entries.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => openDemo(d)}
                    style={{ padding: '6px 16px', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {d.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-1)' }}>
        {doc?.map.fileName || (doc ? 'Untitled' : 'No map open')}
      </span>
      {showTypes && <ObjectTypesEditor onClose={() => setShowTypes(false)} />}
    </div>
  );
}
