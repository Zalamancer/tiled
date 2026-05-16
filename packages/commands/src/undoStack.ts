// Port of QUndoCommand + QUndoStack used by every Tiled editor command.
//
// The Qt model:
//   - `QUndoCommand` is an abstract base with `redo()`, `undo()`, `id()`,
//     `mergeWith(other)`. Commands form a tree (children are executed in
//     subclass order, useful for macros).
//   - `QUndoStack` keeps an index into a list of commands and exposes
//     `push()`, `undo()`, `redo()`, `beginMacro()` / `endMacro()` plus
//     `canUndoChanged` / `canRedoChanged` signals (we use a simple subscriber
//     model instead of QObject signals).

export interface UndoCommand {
  /** Optional id used for merging consecutive commands of the same kind. */
  readonly id?: number;
  /** Optional human-readable text for the undo dock. */
  text: string;
  /** Apply (or re-apply) the command. */
  redo(): void;
  /** Reverse the command. */
  undo(): void;
  /** Whether two commands can collapse into one. */
  mergeWith?(other: UndoCommand): boolean;
  /** Returns true if the command had no actual effect and can be dropped. */
  isObsolete?(): boolean;
  /** Optional child commands executed atomically with this one. */
  children?: UndoCommand[];
}

export type UndoStackListener = (stack: UndoStack) => void;

/**
 * Stack of undoable commands with macro support, identical in behaviour to
 * `QUndoStack`. New commands clobber any redo state — the lifecycle is:
 *
 *     push(c) → execute c then trim history at current index
 *     undo()  → invokes c.undo() and steps index back
 *     redo()  → invokes c.redo() and steps index forward
 */
export class UndoStack {
  private stack: UndoCommand[] = [];
  private index = 0;
  private cleanIndex = 0;
  private listeners = new Set<UndoStackListener>();
  private macros: UndoCommand[][] = [];
  private macroLabels: string[] = [];

  push(command: UndoCommand): void {
    // Apply first so that anything synchronous (validation, exception) happens
    // before we mutate stack state.
    command.redo();
    if (command.isObsolete?.()) return;

    if (this.macros.length > 0) {
      this.macros[this.macros.length - 1]!.push(command);
      return;
    }

    // Try to merge with the previous command.
    const prev = this.stack[this.index - 1];
    if (
      prev &&
      command.id !== undefined &&
      prev.id === command.id &&
      prev.mergeWith?.(command)
    ) {
      // merged in place; truncate any redo history
      this.stack.length = this.index;
      this.emit();
      return;
    }

    // Discard redo history.
    this.stack.length = this.index;
    this.stack.push(command);
    this.index += 1;
    this.emit();
  }

  /** Begin a macro. All `push`es until `endMacro()` are grouped. */
  beginMacro(label: string): void {
    this.macros.push([]);
    this.macroLabels.push(label);
  }

  endMacro(): void {
    if (this.macros.length === 0) throw new Error('endMacro without beginMacro');
    const children = this.macros.pop()!;
    const label = this.macroLabels.pop()!;
    if (children.length === 0) return;
    const composite: UndoCommand = {
      text: label,
      children,
      redo: () => {
        for (let i = 0; i < children.length; i++) children[i]!.redo();
      },
      undo: () => {
        for (let i = children.length - 1; i >= 0; i--) children[i]!.undo();
      },
    };

    if (this.macros.length > 0) {
      this.macros[this.macros.length - 1]!.push(composite);
      return;
    }

    this.stack.length = this.index;
    this.stack.push(composite);
    this.index += 1;
    this.emit();
  }

  canUndo(): boolean {
    return this.index > 0;
  }
  canRedo(): boolean {
    return this.index < this.stack.length;
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.index -= 1;
    this.stack[this.index]!.undo();
    this.emit();
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.stack[this.index]!.redo();
    this.index += 1;
    this.emit();
  }

  undoText(): string | undefined {
    return this.canUndo() ? this.stack[this.index - 1]!.text : undefined;
  }

  redoText(): string | undefined {
    return this.canRedo() ? this.stack[this.index]!.text : undefined;
  }

  clear(): void {
    this.stack = [];
    this.index = 0;
    this.cleanIndex = 0;
    this.macros = [];
    this.macroLabels = [];
    this.emit();
  }

  setClean(): void {
    this.cleanIndex = this.index;
    this.emit();
  }

  isClean(): boolean {
    return this.index === this.cleanIndex;
  }

  /** Number of commands currently in the stack (excluding redo-history). */
  count(): number {
    return this.stack.length;
  }

  /** Index of the next-to-undo command. */
  currentIndex(): number {
    return this.index;
  }

  commandAt(i: number): UndoCommand | undefined {
    return this.stack[i];
  }

  onChange(l: UndoStackListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }
}
