// Modal for editing a tile's collision shapes.
//
// The collision data is an `ObjectGroup` attached to the Tile. The editor
// shows the tile pixel grid and lets the user add/remove/edit collision
// objects (rectangle, ellipse, point, polygon). Edits are applied on Apply
// via one `ChangeTileObjectGroup` undo command — undo restores the original
// group exactly.

import { useState } from 'react';

import {
  MapObject,
  MapObjectShape,
  ObjectGroup,
  Tile,
} from '@tiled-ts/core';
import { ChangeTileObjectGroup } from '@tiled-ts/commands';

import { useActiveDoc } from '../state/editorStore.js';

export interface TileCollisionEditorProps {
  tile: Tile;
  onClose(): void;
}

export function TileCollisionEditor(props: TileCollisionEditorProps): JSX.Element {
  const { tile, onClose } = props;
  const doc = useActiveDoc();
  const [group, setGroup] = useState<ObjectGroup>(() => {
    const cloned = tile.objectGroup ? (tile.objectGroup.clone() as ObjectGroup) : new ObjectGroup('Collision');
    return cloned;
  });
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const apply = () => {
    if (!doc) return;
    doc.undoStack.push(new ChangeTileObjectGroup(doc, tile, group.isEmpty() ? undefined : group));
    onClose();
  };

  const addObject = (shape: MapObjectShape) => {
    const w = shape === MapObjectShape.Point ? 0 : Math.min(tile.width, 16);
    const h = shape === MapObjectShape.Point ? 0 : Math.min(tile.height, 16);
    const obj = new MapObject('', '', { x: 0, y: 0 }, { width: w, height: h });
    obj.setShape(shape);
    group.addObject(obj);
    bump();
  };

  const removeAt = (i: number) => {
    group.removeObjectAt(i);
    bump();
  };

  const updateObject = (i: number, patch: Partial<{ x: number; y: number; width: number; height: number }>) => {
    const obj = group.objectAt(i);
    if (!obj) return;
    if (patch.x !== undefined || patch.y !== undefined) {
      obj.setPosition({ x: patch.x ?? obj.x, y: patch.y ?? obj.y });
    }
    if (patch.width !== undefined || patch.height !== undefined) {
      obj.setSize({ width: patch.width ?? obj.width, height: patch.height ?? obj.height });
    }
    bump();
  };

  return (
    <div
      role="dialog"
      aria-label="Tile collision editor"
      style={{
        position: 'fixed',
        inset: '10%',
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 32px rgba(0,0,0,.4)',
      }}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <strong>Collision — Tile {tile.id}</strong>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <CollisionPreview tile={tile} group={group} version={version} />
        <div style={{ flex: 1, padding: 12, overflow: 'auto' }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ color: 'var(--text-1)' }}>Add:</span>
            <button onClick={() => addObject(MapObjectShape.Rectangle)}>Rect</button>
            <button onClick={() => addObject(MapObjectShape.Ellipse)}>Ellipse</button>
            <button onClick={() => addObject(MapObjectShape.Point)}>Point</button>
          </div>
          {group.objectCount() === 0 && (
            <div style={{ color: 'var(--text-1)' }}>No collision shapes — tile is solid-free.</div>
          )}
          {group.objects.map((obj, i) => (
            <div key={i} className="row" style={{ paddingBlock: 2 }}>
              <span style={{ width: 60, color: 'var(--text-1)' }}>
                {MapObjectShape[obj.shape].slice(0, 4).toLowerCase()}
              </span>
              <Field label="x" value={obj.x} onChange={(v) => updateObject(i, { x: v })} />
              <Field label="y" value={obj.y} onChange={(v) => updateObject(i, { y: v })} />
              {obj.shape !== MapObjectShape.Point && (
                <>
                  <Field label="w" value={obj.width} onChange={(v) => updateObject(i, { width: v })} />
                  <Field label="h" value={obj.height} onChange={(v) => updateObject(i, { height: v })} />
                </>
              )}
              <button className="icon-button" onClick={() => removeAt(i)}>
                ✕
              </button>
            </div>
          ))}
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

function Field(props: { label: string; value: number; onChange(v: number): void }): JSX.Element {
  return (
    <label style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {props.label}
      <input
        type="number"
        step="any"
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
        style={{ width: 60 }}
      />
    </label>
  );
}

/** Visual preview: a SVG of the tile-pixel canvas with the collision shapes
 *  overlaid. Doesn't render the tile texture (loaded asynchronously); we
 *  display a checkerboard placeholder behind the shapes. */
function CollisionPreview(props: { tile: Tile; group: ObjectGroup; version: number }): JSX.Element {
  const { tile, group } = props;
  const w = Math.max(1, tile.width || 16);
  const h = Math.max(1, tile.height || 16);
  const scale = Math.max(1, Math.floor(256 / Math.max(w, h)));

  return (
    <div style={{ padding: 12, borderRight: '1px solid var(--border)', minWidth: 280 }}>
      <div
        style={{
          width: w * scale,
          height: h * scale,
          position: 'relative',
          background: 'repeating-conic-gradient(var(--bg-2) 0% 25%, var(--bg-3) 25% 50%) 0/16px 16px',
          border: '1px solid var(--border)',
        }}
      >
        <svg
          width={w * scale}
          height={h * scale}
          viewBox={`0 0 ${w} ${h}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          {group.objects.map((obj, i) => (
            <Shape key={i} obj={obj} />
          ))}
        </svg>
      </div>
      <div style={{ marginTop: 6, color: 'var(--text-1)', fontSize: 11 }}>
        {w}×{h} px, {group.objectCount()} shape(s)
      </div>
    </div>
  );
}

function Shape({ obj }: { obj: MapObject }): JSX.Element | null {
  const stroke = '#4fb0ff';
  switch (obj.shape) {
    case MapObjectShape.Rectangle:
      return (
        <rect
          x={obj.x}
          y={obj.y}
          width={obj.width}
          height={obj.height}
          fill="rgba(79,176,255,0.2)"
          stroke={stroke}
          strokeWidth={0.5}
        />
      );
    case MapObjectShape.Ellipse:
      return (
        <ellipse
          cx={obj.x + obj.width / 2}
          cy={obj.y + obj.height / 2}
          rx={obj.width / 2}
          ry={obj.height / 2}
          fill="rgba(79,176,255,0.2)"
          stroke={stroke}
          strokeWidth={0.5}
        />
      );
    case MapObjectShape.Point:
      return <circle cx={obj.x} cy={obj.y} r={0.8} fill={stroke} />;
    case MapObjectShape.Polygon:
    case MapObjectShape.Polyline:
      return (
        <polyline
          points={obj.polygon.map((p) => `${obj.x + p.x},${obj.y + p.y}`).join(' ')}
          fill={obj.shape === MapObjectShape.Polygon ? 'rgba(79,176,255,0.2)' : 'none'}
          stroke={stroke}
          strokeWidth={0.5}
        />
      );
    default:
      return null;
  }
}
