// Console adapter — the surface that user scripts and host editors can use to
// log messages. Equivalent to upstream's IssuesDock + console window: scripts
// emit `log`/`warn`/`error` and the host either renders them in a dock or
// silently drops them.
//
// A default implementation that proxies to the host's `console` is provided so
// that headless scripts (CI runs, tests) still see output. Editor apps wire in
// their own adapter via `new ScriptHost({ console: myAdapter })`.

export interface Console {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Default implementation routing to the host JS `console` object. */
export const defaultConsole: Console = {
  log(message: string): void {
    // eslint-disable-next-line no-console
    globalThis.console?.log?.(message);
  },
  warn(message: string): void {
    // eslint-disable-next-line no-console
    globalThis.console?.warn?.(message);
  },
  error(message: string): void {
    // eslint-disable-next-line no-console
    globalThis.console?.error?.(message);
  },
};

/** Console that captures everything into an in-memory list. Useful for tests
 *  and for hosts that want to render an issues dock later. */
export class RecordingConsole implements Console {
  readonly entries: Array<{ level: 'log' | 'warn' | 'error'; message: string }> = [];
  log(message: string): void {
    this.entries.push({ level: 'log', message });
  }
  warn(message: string): void {
    this.entries.push({ level: 'warn', message });
  }
  error(message: string): void {
    this.entries.push({ level: 'error', message });
  }
  clear(): void {
    this.entries.length = 0;
  }
}
