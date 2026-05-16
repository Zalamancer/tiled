// Stand-alone TMX/TMJ viewer.
//
// Mirrors the upstream `tmxviewer` Qt app: pick a map, render it, allow the
// user to pan with the mouse and zoom with the wheel. Intentionally feature-
// poor compared to the full editor — no toolbar, no docks, no editing.

import { useCallback, useMemo, useState } from 'react';

import type { Map as TiledMap } from '@tiled-ts/core';
import { readMapJson } from '@tiled-ts/format';

import { MapCanvas } from './MapCanvas.js';
import { defaultImageLoader } from './imageLoader.js';
import type { ImageLoader } from './imageLoader.js';

export interface ViewerProps {
  /** Pre-loaded map (skips the file-input UI). Useful in tests. */
  initialMap?: TiledMap;
  /** Pluggable image loader (defaults to fetching tileset URLs by `src`). */
  imageLoader?: ImageLoader;
}

export function Viewer({ initialMap, imageLoader }: ViewerProps): JSX.Element {
  const [map, setMap] = useState<TiledMap | undefined>(initialMap);
  const [error, setError] = useState<string | undefined>(undefined);

  const loader = useMemo(() => imageLoader ?? defaultImageLoader, [imageLoader]);

  const onFile = useCallback(async (file: File) => {
    setError(undefined);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const m = readMapJson(json);
      setMap(m);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load map: ${msg}`);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          padding: '8px 12px',
          background: '#1c1c1f',
          borderBottom: '1px solid #2a2a2e',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <strong style={{ fontSize: 14 }}>tiled-ts viewer</strong>
        <label
          style={{
            cursor: 'pointer',
            padding: '4px 10px',
            background: '#2a2a2e',
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Open .tmj…
          <input
            data-testid="tmj-file-input"
            type="file"
            accept=".tmj,.json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>
        {map && (
          <span style={{ fontSize: 12, color: '#aaa' }}>
            {map.width}×{map.height} tiles · {map.tileWidth}×{map.tileHeight} px
          </span>
        )}
        {error && <span style={{ color: '#f88', fontSize: 12 }}>{error}</span>}
      </header>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {map ? (
          <MapCanvas map={map} imageLoader={loader} />
        ) : (
          <div
            data-testid="empty-state"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#666',
              fontSize: 14,
            }}
          >
            Pick a .tmj file to begin.
          </div>
        )}
      </div>
    </div>
  );
}

