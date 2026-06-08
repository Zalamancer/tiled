// Tileset dock — list of tilesets in the active map, with a tile picker grid
// per tileset. Selecting a tile builds a 1×1 TileStamp and assigns it to the
// editor's active stamp. When a tile is selected, additional buttons surface
// the animation and collision editors.

import { useState } from 'react';

import { Cell, TileLayer } from '@tiled-ts/core';
import { TileStamp } from '@tiled-ts/tools';

import { useActiveDoc, useEditor } from '../state/editorStore.js';
import { TileAnimationEditor } from '../components/TileAnimationEditor.js';
import { TileCollisionEditor } from '../components/TileCollisionEditor.js';

export function TilesetDock(): JSX.Element {
  const doc = useActiveDoc();
  const selectedTileset = useEditor((s) => s.selectedTileset);
  const selectedTile = useEditor((s) => s.selectedTile);
  const setSelectedTile = useEditor((s) => s.setSelectedTile);
  const setStamp = useEditor((s) => s.setStamp);
  const [showAnim, setShowAnim] = useState(false);
  const [showColl, setShowColl] = useState(false);

  if (!doc) {
    return (
      <div className="dock">
        <div className="dock-title">Tilesets</div>
        <div className="dock-body" style={{ color: 'var(--text-1)' }}>
          No map open.
        </div>
      </div>
    );
  }

  const tilesets = doc.map.tilesets;

  return (
    <div className="dock">
      <div className="dock-title">Tilesets</div>
      <div className="dock-body">
        {tilesets.length === 0 && (
          <div style={{ color: 'var(--text-1)' }}>This map has no tilesets.</div>
        )}
        {tilesets.map((ts, index) => (
          <details key={`${ts.name}:${index}`} open={ts === selectedTileset}>
            <summary style={{ cursor: 'pointer', padding: '4px 0' }}>{ts.name}</summary>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, ts.columnCount || 8)}, 32px)` }}>
              {ts.tiles.map((tile) => (
                <div
                  key={tile.id}
                  className={`tileset-thumb ${selectedTile === tile ? 'selected' : ''}`}
                  title={`Tile ${tile.id}`}
                  onClick={() => {
                    setSelectedTile(tile, ts);
                    const v = new TileLayer('v', 0, 0, 1, 1);
                    v.setCell(0, 0, new Cell(ts, tile.id));
                    const stamp = new TileStamp();
                    stamp.addVariation(v);
                    setStamp(stamp);
                  }}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
      {selectedTile && selectedTileset && (
        <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setShowAnim(true)}>Animation…</button>
          <button onClick={() => setShowColl(true)}>Collision…</button>
        </div>
      )}
      {showAnim && selectedTile && selectedTileset && (
        <TileAnimationEditor
          tile={selectedTile}
          tileset={selectedTileset}
          onClose={() => setShowAnim(false)}
        />
      )}
      {showColl && selectedTile && (
        <TileCollisionEditor tile={selectedTile} onClose={() => setShowColl(false)} />
      )}
    </div>
  );
}
