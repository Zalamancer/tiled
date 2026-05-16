// Layer list — visibility toggle, lock toggle, opacity slider, reorder/delete.

import { Layer, TileLayer } from '@tiled-ts/core';
import {
  AddLayer,
  MoveLayer,
  RemoveLayer,
  SetLayerLocked,
  SetLayerName,
  SetLayerOpacity,
  SetLayerVisible,
} from '@tiled-ts/commands';

import { useActiveDoc } from '../state/editorStore.js';

export function LayerDock(): JSX.Element {
  const doc = useActiveDoc();
  if (!doc) {
    return (
      <div className="dock">
        <div className="dock-title">Layers</div>
        <div className="dock-body" style={{ color: 'var(--text-1)' }}>
          No map open.
        </div>
      </div>
    );
  }

  const layers = doc.map.layers;
  const currentIndex = doc.currentLayerIndex;

  const addTileLayer = () => {
    const layer = new TileLayer('Tile Layer', 0, 0, doc.map.width, doc.map.height);
    layer.id = doc.map.takeNextLayerId();
    doc.undoStack.push(new AddLayer(doc, layers.length, layer));
  };

  return (
    <div className="dock">
      <div className="dock-title">Layers</div>
      <div className="dock-body">
        {[...layers].reverse().map((layer, revIdx) => {
          const idx = layers.length - 1 - revIdx;
          return (
            <LayerRow
              key={layer.id}
              layer={layer}
              index={idx}
              active={idx === currentIndex}
              onActivate={() => {
                doc.currentLayerIndex = idx;
                doc.emit({ kind: 'layer-changed', map: doc.map, layer, properties: 0 });
              }}
              onMove={(delta) => {
                const to = idx + delta;
                if (to < 0 || to >= layers.length) return;
                doc.undoStack.push(new MoveLayer(doc, layer, to));
              }}
              onRemove={() => doc.undoStack.push(new RemoveLayer(doc, idx))}
              onRename={(name) => doc.undoStack.push(new SetLayerName(doc, layer, name))}
              onToggleVisible={() => doc.undoStack.push(new SetLayerVisible(doc, layer, !layer.visible))}
              onToggleLocked={() => doc.undoStack.push(new SetLayerLocked(doc, layer, !layer.locked))}
              onOpacityChange={(v) => doc.undoStack.push(new SetLayerOpacity(doc, layer, v))}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid var(--border)' }}>
        <button onClick={addTileLayer}>+ Tile Layer</button>
      </div>
    </div>
  );
}

interface LayerRowProps {
  layer: Layer;
  index: number;
  active: boolean;
  onActivate(): void;
  onMove(delta: number): void;
  onRemove(): void;
  onRename(name: string): void;
  onToggleVisible(): void;
  onToggleLocked(): void;
  onOpacityChange(v: number): void;
}

function LayerRow(props: LayerRowProps): JSX.Element {
  const { layer, active, onActivate, onMove, onRemove, onToggleVisible, onToggleLocked, onOpacityChange, onRename } = props;
  return (
    <div className={`layer-row ${active ? 'active' : ''}`} onClick={onActivate}>
      <button
        className="icon-button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible();
        }}
        title={layer.visible ? 'Hide' : 'Show'}
      >
        {layer.visible ? '👁' : '–'}
      </button>
      <button
        className="icon-button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLocked();
        }}
        title={layer.locked ? 'Unlock' : 'Lock'}
      >
        {layer.locked ? '🔒' : '🔓'}
      </button>
      <input
        type="text"
        defaultValue={layer.name}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (e.currentTarget.value !== layer.name) onRename(e.currentTarget.value);
        }}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number"
        min={0}
        max={1}
        step={0.05}
        defaultValue={layer.opacity}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onOpacityChange(Number(e.currentTarget.value))}
        style={{ width: 50 }}
      />
      <button
        className="icon-button"
        onClick={(e) => {
          e.stopPropagation();
          onMove(1);
        }}
      >
        ↑
      </button>
      <button
        className="icon-button"
        onClick={(e) => {
          e.stopPropagation();
          onMove(-1);
        }}
      >
        ↓
      </button>
      <button
        className="icon-button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ✕
      </button>
    </div>
  );
}
