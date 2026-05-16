// Undo history list. Clicking an entry jumps the stack to that point.

import { useActiveDoc, useEditor } from '../state/editorStore.js';

export function UndoDock(): JSX.Element {
  const doc = useActiveDoc();
  useEditor((s) => s.version); // subscribe to invalidations

  if (!doc) {
    return (
      <div className="dock">
        <div className="dock-title">History</div>
        <div className="dock-body" style={{ color: 'var(--text-1)' }}>
          No map open.
        </div>
      </div>
    );
  }

  const stack = doc.undoStack;
  const current = stack.currentIndex();
  const items: { i: number; text: string }[] = [];
  for (let i = 0; i < stack.count(); i++) {
    items.push({ i, text: stack.commandAt(i)?.text ?? '?' });
  }

  return (
    <div className="dock">
      <div className="dock-title">History</div>
      <div className="dock-body">
        <div
          className={`undo-entry ${current === 0 ? 'current' : ''}`}
          onClick={() => {
            while (stack.canUndo()) stack.undo();
          }}
        >
          (clean)
        </div>
        {items.map(({ i, text }) => (
          <div
            key={i}
            className={`undo-entry ${i + 1 === current ? 'current' : ''}`}
            onClick={() => {
              while (stack.currentIndex() < i + 1 && stack.canRedo()) stack.redo();
              while (stack.currentIndex() > i + 1 && stack.canUndo()) stack.undo();
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}
