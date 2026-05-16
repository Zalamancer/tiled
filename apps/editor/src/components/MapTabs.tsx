// Tabs across the top showing each open MapDocument.

import { useEditor } from '../state/editorStore.js';

export function MapTabs(): JSX.Element {
  const docs = useEditor((s) => s.docs);
  const activeIndex = useEditor((s) => s.activeDocIndex);
  const setActive = useEditor((s) => s.setActiveDoc);
  const close = useEditor((s) => s.closeMap);

  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {docs.map((doc, i) => (
        <div
          key={i}
          onClick={() => setActive(i)}
          style={{
            padding: '6px 10px',
            cursor: 'pointer',
            borderRight: '1px solid var(--border)',
            background: i === activeIndex ? 'var(--bg-0)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {doc.map.fileName || `Untitled ${i + 1}`}
          {!doc.undoStack.isClean() ? ' ●' : ''}
          <span
            className="icon-button"
            onClick={(e) => {
              e.stopPropagation();
              close(i);
            }}
          >
            ✕
          </span>
        </div>
      ))}
      {docs.length === 0 && (
        <div style={{ padding: '6px 10px', color: 'var(--text-1)' }}>No maps open</div>
      )}
    </div>
  );
}
