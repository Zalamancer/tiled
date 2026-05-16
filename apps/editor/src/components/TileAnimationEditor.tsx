// Modal for editing a tile's animation frames.
//
// Each row is `(tileId, durationMs)`. The live preview cycles through the
// frames at the requested speed. Hitting Apply pushes a single
// `ChangeTileAnimation` undo entry.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Frame, Tile, Tileset } from '@tiled-ts/core';
import { ChangeTileAnimation } from '@tiled-ts/commands';

import { useActiveDoc } from '../state/editorStore.js';

export interface TileAnimationEditorProps {
  tile: Tile;
  tileset: Tileset;
  onClose(): void;
}

export function TileAnimationEditor(props: TileAnimationEditorProps): JSX.Element {
  const { tile, tileset, onClose } = props;
  const doc = useActiveDoc();
  const [frames, setFrames] = useState<Frame[]>(tile.frames.map((f) => ({ ...f })));

  const apply = () => {
    if (!doc) return;
    doc.undoStack.push(new ChangeTileAnimation(doc, tile, frames));
    onClose();
  };

  const addFrame = () => {
    setFrames((fs) => [...fs, { tileId: tile.id, duration: 100 }]);
  };

  const updateFrame = (i: number, patch: Partial<Frame>) => {
    setFrames((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };

  const removeFrame = (i: number) => {
    setFrames((fs) => fs.filter((_, idx) => idx !== i));
  };

  return (
    <div
      role="dialog"
      aria-label="Tile animation editor"
      style={{
        position: 'fixed',
        inset: '15%',
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 32px rgba(0,0,0,.4)',
      }}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <strong>Animation — Tile {tile.id}</strong>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, padding: 12, overflow: 'auto', borderRight: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8, color: 'var(--text-1)' }}>Frames</div>
          {frames.length === 0 && (
            <div style={{ color: 'var(--text-1)' }}>No frames — tile is static.</div>
          )}
          {frames.map((f, i) => (
            <div key={i} className="row" style={{ paddingBlock: 2 }}>
              <span style={{ width: 16, color: 'var(--text-1)' }}>{i + 1}</span>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                Tile
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={f.tileId}
                  onChange={(e) => updateFrame(i, { tileId: Number(e.currentTarget.value) })}
                  style={{ width: 70 }}
                />
              </label>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                ms
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={f.duration}
                  onChange={(e) => updateFrame(i, { duration: Number(e.currentTarget.value) })}
                  style={{ width: 70 }}
                />
              </label>
              <button className="icon-button" onClick={() => removeFrame(i)}>
                ✕
              </button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <button onClick={addFrame}>+ Add frame</button>
          </div>
        </div>
        <div style={{ width: 220, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'var(--text-1)' }}>Preview</div>
          <AnimationPreview tileset={tileset} frames={frames} />
        </div>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
        <span style={{ flex: 1 }} />
        <button onClick={onClose}>Cancel</button>
        <button onClick={apply}>Apply</button>
      </div>
    </div>
  );
}

function AnimationPreview(props: { tileset: Tileset; frames: Frame[] }): JSX.Element {
  const [frameIndex, setFrameIndex] = useState(0);
  const elapsedRef = useRef(0);
  const tile = useMemo(() => {
    if (props.frames.length === 0) return undefined;
    const id = props.frames[frameIndex % props.frames.length]!.tileId;
    return props.tileset.findTile(id);
  }, [props.frames, props.tileset, frameIndex]);

  useEffect(() => {
    elapsedRef.current = 0;
    setFrameIndex(0);
    if (props.frames.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      elapsedRef.current += dt;
      const cur = props.frames[frameIndex % props.frames.length]!;
      if (elapsedRef.current >= cur.duration) {
        elapsedRef.current -= cur.duration;
        setFrameIndex((i) => (i + 1) % props.frames.length);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [props.frames]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-testid="animation-preview"
      style={{
        width: 64,
        height: 64,
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: 'var(--text-1)',
      }}
    >
      {tile ? `tile ${tile.id}` : '—'}
    </div>
  );
}
