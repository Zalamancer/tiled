// Bottom status bar — shows map name, dimensions, tool hint.

import { useActiveDoc, useEditor } from '../state/editorStore.js';

export function StatusBar(): JSX.Element {
  const doc = useActiveDoc();
  const toolName = useEditor((s) => s.activeToolId);

  return (
    <div className="statusbar">
      {doc ? (
        <>
          <span>{doc.map.fileName || 'Untitled'}</span>
          <span>
            {doc.map.width}×{doc.map.height} ({doc.map.tileWidth}×{doc.map.tileHeight})
          </span>
          <span>Layers: {doc.map.layerCount()}</span>
        </>
      ) : (
        <span>No map open</span>
      )}
      <span style={{ flex: 1 }} />
      <span>Tool: {toolName}</span>
    </div>
  );
}
