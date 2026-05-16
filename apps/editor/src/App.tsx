import { useEffect } from 'react';

import { Toolbar } from './components/Toolbar.js';
import { MapTabs } from './components/MapTabs.js';
import { StatusBar } from './components/StatusBar.js';
import { ToolPalette } from './components/ToolPalette.js';
import { MapCanvas } from './canvas/MapCanvas.js';
import { LayerDock } from './docks/LayerDock.js';
import { TilesetDock } from './docks/TilesetDock.js';
import { UndoDock } from './docks/UndoDock.js';
import { PropertiesDock } from './docks/PropertiesDock.js';
import { MinimapDock } from './docks/MinimapDock.js';
import { REGISTERED_TOOLS, useEditor } from './state/editorStore.js';

export function App(): JSX.Element {
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const activeTool = useEditor((s) => s.activeTool);

  // Initialise the first tool once at mount.
  useEffect(() => {
    if (!activeTool) setActiveTool('stamp');
  }, [activeTool, setActiveTool]);

  // Keyboard shortcuts: tool letters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const t = REGISTERED_TOOLS.find((tool) => tool.shortcut?.toLowerCase() === e.key.toLowerCase());
      if (t) {
        e.preventDefault();
        setActiveTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTool]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar />
      <MapTabs />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ToolPalette />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <MapCanvas />
        </div>
        <div
          style={{
            width: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 6,
            background: 'var(--bg-0)',
            borderLeft: '1px solid var(--border)',
            overflow: 'auto',
          }}
        >
          <LayerDock />
          <TilesetDock />
          <PropertiesDock />
          <UndoDock />
          <MinimapDock />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
