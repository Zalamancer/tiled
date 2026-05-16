import { describe, expect, it, vi } from 'vitest';

import { UndoStack, type UndoCommand } from '../src/index.js';

function makeCmd(name: string, mergeId?: number): UndoCommand & { state: { redos: number; undos: number } } {
  const state = { redos: 0, undos: 0 };
  return {
    text: name,
    id: mergeId,
    state,
    redo() {
      state.redos += 1;
    },
    undo() {
      state.undos += 1;
    },
    mergeWith(_o: UndoCommand): boolean {
      // tests override per-instance when needed
      return false;
    },
  };
}

describe('UndoStack', () => {
  it('push/redo invokes redo() exactly once', () => {
    const s = new UndoStack();
    const c = makeCmd('a');
    s.push(c);
    expect(c.state.redos).toBe(1);
    expect(s.canUndo()).toBe(true);
    expect(s.canRedo()).toBe(false);
  });

  it('undo/redo balance', () => {
    const s = new UndoStack();
    const c = makeCmd('a');
    s.push(c);
    s.undo();
    expect(c.state.undos).toBe(1);
    expect(s.canRedo()).toBe(true);
    s.redo();
    expect(c.state.redos).toBe(2);
  });

  it('push after undo discards redo history', () => {
    const s = new UndoStack();
    const a = makeCmd('a');
    const b = makeCmd('b');
    const c = makeCmd('c');
    s.push(a);
    s.push(b);
    s.undo(); // history at index 1, b undone
    s.push(c);
    expect(s.canRedo()).toBe(false);
    expect(s.count()).toBe(2); // [a, c]
  });

  it('merges adjacent commands with matching id', () => {
    const s = new UndoStack();
    const merger = vi.fn(() => true);
    const a: UndoCommand = { text: 'a', id: 7, redo: () => {}, undo: () => {}, mergeWith: merger };
    const b: UndoCommand = { text: 'b', id: 7, redo: () => {}, undo: () => {}, mergeWith: () => false };
    s.push(a);
    s.push(b);
    expect(merger).toHaveBeenCalledTimes(1);
    expect(s.count()).toBe(1);
  });

  it('does not merge across different ids', () => {
    const s = new UndoStack();
    s.push({ text: 'a', id: 7, redo: () => {}, undo: () => {}, mergeWith: () => true });
    s.push({ text: 'b', id: 8, redo: () => {}, undo: () => {}, mergeWith: () => true });
    expect(s.count()).toBe(2);
  });

  it('beginMacro/endMacro groups commands into one entry', () => {
    const s = new UndoStack();
    const a = makeCmd('a');
    const b = makeCmd('b');
    s.beginMacro('group');
    s.push(a);
    s.push(b);
    s.endMacro();
    expect(s.count()).toBe(1);
    expect(a.state.redos).toBe(1);
    s.undo();
    expect(b.state.undos).toBe(1);
    expect(a.state.undos).toBe(1);
  });

  it('isClean follows setClean', () => {
    const s = new UndoStack();
    expect(s.isClean()).toBe(true);
    s.push(makeCmd('a'));
    expect(s.isClean()).toBe(false);
    s.setClean();
    expect(s.isClean()).toBe(true);
    s.undo();
    expect(s.isClean()).toBe(false);
  });

  it('listener fires on every state change', () => {
    const s = new UndoStack();
    const sub = vi.fn();
    s.onChange(sub);
    s.push(makeCmd('a'));
    s.undo();
    s.redo();
    s.clear();
    expect(sub.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
