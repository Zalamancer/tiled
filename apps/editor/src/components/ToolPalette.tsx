// Vertical column of tool buttons (left sidebar).

import { REGISTERED_TOOLS, useEditor } from '../state/editorStore.js';

export function ToolPalette(): JSX.Element {
  const activeToolId = useEditor((s) => s.activeToolId);
  const setActiveTool = useEditor((s) => s.setActiveTool);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {REGISTERED_TOOLS.map((t) => (
        <button
          key={t.id}
          className={activeToolId === t.id ? 'active' : ''}
          title={`${t.name}${t.shortcut ? ` (${t.shortcut})` : ''}`}
          onClick={() => setActiveTool(t.id)}
          style={{ minWidth: 120, textAlign: 'left' }}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
