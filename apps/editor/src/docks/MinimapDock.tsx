// Minimap dock — schematic preview of the active map.
//
// In a full integration we'd render via @tiled-ts/render-pixi's
// `MinimapRenderer` to a separate Pixi Application. For Phase 7 we keep it
// lightweight: a CSS rendition that summarises which cells are filled.

import { useActiveDoc } from '../state/editorStore.js';

export function MinimapDock(): JSX.Element {
  const doc = useActiveDoc();
  if (!doc) {
    return (
      <div className="dock">
        <div className="dock-title">Minimap</div>
        <div className="dock-body" style={{ color: 'var(--text-1)' }}>
          No map open.
        </div>
      </div>
    );
  }

  const tl = [...doc.map.tileLayers()][0];
  const w = doc.map.width;
  const h = doc.map.height;
  const cellSize = Math.max(1, Math.min(8, Math.floor(160 / Math.max(w, h))));

  const cells: JSX.Element[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const filled = tl ? !tl.cellAt(x, y).isEmpty() : false;
      cells.push(
        <div
          key={`${x},${y}`}
          style={{
            position: 'absolute',
            left: x * cellSize,
            top: y * cellSize,
            width: cellSize,
            height: cellSize,
            background: filled ? 'var(--accent)' : 'var(--bg-2)',
          }}
        />,
      );
    }
  }

  return (
    <div className="dock">
      <div className="dock-title">Minimap</div>
      <div className="dock-body" style={{ alignItems: 'center', display: 'flex' }}>
        <div style={{ position: 'relative', width: w * cellSize, height: h * cellSize }}>{cells}</div>
      </div>
    </div>
  );
}
