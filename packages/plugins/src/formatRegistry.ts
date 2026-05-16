// Shared format-plugin contract & a tiny in-memory registry.
//
// Tiled's C++ `MapFormat` API is a Qt plugin with `read` / `write`
// / `supportsFile` / `nameFilter` / `shortName`. We keep the equivalent
// surface here as a plain interface so plugins are trivial to register at
// runtime and to test in isolation.

import type { Map as TiledMap } from '@tiled-ts/core';

export enum FormatCapability {
  Read = 1 << 0,
  Write = 1 << 1,
}

export interface FileFormat {
  /** Stable short identifier, e.g. `'csv'`, `'lua'`. */
  readonly id: string;
  /** User-facing label, e.g. `'CSV files'`. */
  readonly name: string;
  /** Primary file extension *without* the dot, e.g. `'csv'`, `'lua'`. */
  readonly extension: string;
  /** Bitset of `FormatCapability` flags. */
  readonly capabilities: number;
  /**
   * Encode `map` into one or more text payloads.
   *
   * Plugins that emit a single file return a single-entry record (key is the
   * suggested filename — the caller decides where to persist it). Plugins
   * that emit one file *per layer* (the CSV plugin) return multiple entries.
   */
  write(map: TiledMap): Record<string, string>;
  /**
   * Optional read path. Only implemented for plugins where a faithful
   * round-trip is straightforward (CSV, Lua). The argument is a record keyed
   * by suggested filename: the caller provides the file payloads and the
   * plugin decides what to do with them.
   */
  read?(input: Record<string, string>): TiledMap;
}

/** Returns true when the plugin advertises read capability. */
export function canRead(f: FileFormat): boolean {
  return Boolean(f.capabilities & FormatCapability.Read);
}

/** Returns true when the plugin advertises write capability. */
export function canWrite(f: FileFormat): boolean {
  return Boolean(f.capabilities & FormatCapability.Write);
}

/**
 * Simple by-extension / by-id registry. Insertion order is preserved so
 * `findByExtension` returns the first plugin registered for a given suffix.
 */
export class FormatRegistry {
  private byId: Map<string, FileFormat> = new Map();
  private byExt: Map<string, FileFormat[]> = new Map();

  register(format: FileFormat): void {
    this.byId.set(format.id, format);
    const ext = format.extension.toLowerCase();
    const list = this.byExt.get(ext) ?? [];
    list.push(format);
    this.byExt.set(ext, list);
  }

  findById(id: string): FileFormat | undefined {
    return this.byId.get(id);
  }

  /** Returns the first plugin whose `extension` matches (case-insensitive,
   *  with or without a leading dot). */
  findByExtension(ext: string): FileFormat | undefined {
    const cleaned = ext.replace(/^\./, '').toLowerCase();
    return this.byExt.get(cleaned)?.[0];
  }

  /** All plugins registered for the given extension (in registration order). */
  findAllByExtension(ext: string): readonly FileFormat[] {
    const cleaned = ext.replace(/^\./, '').toLowerCase();
    return this.byExt.get(cleaned) ?? [];
  }

  /** Snapshot of all registered plugins (in registration order). */
  all(): readonly FileFormat[] {
    return Array.from(this.byId.values());
  }
}

/** Build a registry that ships every known plugin pre-registered. */
export function createDefaultRegistry(plugins: readonly FileFormat[]): FormatRegistry {
  const r = new FormatRegistry();
  for (const p of plugins) r.register(p);
  return r;
}
