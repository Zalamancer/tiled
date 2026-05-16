// ScriptHost — a JS sandbox that exposes a `tiled` namespace to user scripts.
//
// Threat model
// ────────────
// This is *not* a security boundary. The host runs JS supplied by the user,
// the editor, or installed extensions; we trust those sources the same way
// upstream Tiled does. What the sandbox actually buys us is:
//
//   - A clear API contract — scripts get `tiled`, `console`, plus a small set
//     of `Editable*` constructors. Nothing else from the host's lexical scope
//     leaks through.
//   - `new Function(...)` shadows references to `globalThis.process`,
//     `require`, `eval`, `import`, etc. by declaring them as parameter names,
//     so scripts written for "browser-Tiled" can't reach Node's filesystem
//     by accident.
//
// What this does NOT prevent (deliberately — matching Qt's QJSEngine):
//
//   - Prototype-chain mutation: a malicious script can monkey-patch
//     `Array.prototype.push` and break later commands.
//   - Symbol/iterator tampering.
//   - Tight infinite loops (no timer cancellation).
//   - Reflective access via `function.constructor("…")()` — escaping the
//     sandbox is trivial if the caller wants to, just as in QJSEngine.
//
// In short: ScriptHost is a tidy plug for legitimate users, not a fortress.

import { type MapDocument } from '@tiled-ts/commands';
import type { Map as TiledMap } from '@tiled-ts/core';
import { readMapJson } from '@tiled-ts/format';

import { type Console, defaultConsole } from './console.js';
import { EditableMap } from './editableMap.js';
import { EditableLayer } from './editableLayer.js';
import { EditableTileLayer } from './editableTileLayer.js';
import { EditableObjectGroup } from './editableObjectGroup.js';
import { EditableImageLayer } from './editableImageLayer.js';
import { EditableGroupLayer } from './editableGroupLayer.js';
import { EditableMapObject } from './editableMapObject.js';
import { EditableTileset } from './editableTileset.js';
import { EditableTile } from './editableTile.js';

/** Result of `tiled.registerAction`. Mirrors `ScriptedAction` enough for tests. */
export interface RegisteredAction {
  readonly id: string;
  /** Pretty text shown in menus/dock entries. */
  text: string;
  callback: () => void;
}

/** Plug-in registered with `tiled.registerTool`. */
export interface ScriptedTool {
  name?: string;
  [key: string]: unknown;
}

/** Plug-in registered with `tiled.registerMapFormat`. */
export interface ScriptedMapFormat {
  name?: string;
  extension?: string;
  read?(fileName: string): unknown;
  write?(map: unknown, fileName: string): string | undefined;
}

/** Options accepted by the `ScriptHost` constructor. */
export interface ScriptHostOptions {
  /** Console implementation. Defaults to one that proxies to the JS console. */
  console?: Console;
  /** Application version string, surfaced as `tiled.version`. */
  version?: string;
  /** Optional file-loader. The host editor wires this to its file picker. */
  loadFile?: (path: string) => string | Promise<string>;
}

/**
 * The `tiled` namespace exposed to scripts. Matches the surface of upstream
 * `ScriptModule` (subset).
 */
export interface TiledNamespace {
  /** Application version, mirroring `ScriptModule::version`. */
  readonly version: string;

  /** Currently-active asset, equivalent to `ScriptModule::activeAsset`. */
  activeAsset: EditableMap | undefined;

  /** Currently-active document (null when no map is open). */
  readonly activeDocument: MapDocument | undefined;

  /** Open a map file by path (TMJ). Returns the wrapped EditableMap. */
  open(path: string): Promise<EditableMap>;

  /** Convenience for wrapping an in-memory map. */
  wrapMap(map: TiledMap): EditableMap;

  /** Pop up a modal alert. Routed through the configured console as `log`. */
  alert(message: string, title?: string): void;

  /** Emit a warning issue. Routes through the configured console as `warn`. */
  warn(message: string, title?: string): void;

  /** Emit an error issue. Routes through the configured console as `error`. */
  error(message: string, title?: string): void;

  /** Log a message. Mirrors `ScriptModule::log`. */
  log(message: string): void;

  /** Register a named action. Returns the bookkeeping handle. */
  registerAction(id: string, callback: () => void): RegisteredAction;

  /** Trigger a previously-registered action by id. */
  trigger(id: string): void;

  /** Register a tool. Stored verbatim — tools are dispatched by the editor. */
  registerTool(name: string, factory: ScriptedTool | (() => ScriptedTool)): void;

  /** Register a custom map format. */
  registerMapFormat(name: string, plugin: ScriptedMapFormat): void;

  /** List the ids of registered actions. */
  readonly actions: string[];

  /** List the names of registered tools. */
  readonly tools: string[];

  /** List the names of registered map formats. */
  readonly mapFormats: string[];
}

export class ScriptHost {
  private readonly _console: Console;
  private readonly _version: string;
  private readonly _loadFile: ((p: string) => string | Promise<string>) | undefined;

  private _document: MapDocument | undefined;
  private _activeAsset: EditableMap | undefined;

  private readonly _actions = new Map<string, RegisteredAction>();
  private readonly _tools = new Map<string, ScriptedTool | (() => ScriptedTool)>();
  private readonly _mapFormats = new Map<string, ScriptedMapFormat>();

  /** Public `tiled` namespace passed in as a script global. */
  readonly api: TiledNamespace;

  constructor(options: ScriptHostOptions = {}) {
    this._console = options.console ?? defaultConsole;
    this._version = options.version ?? '1.10.0';
    this._loadFile = options.loadFile;

    const host = this;
    this.api = {
      get version(): string {
        return host._version;
      },
      get activeAsset(): EditableMap | undefined {
        return host._activeAsset;
      },
      set activeAsset(v: EditableMap | undefined) {
        host._activeAsset = v;
      },
      get activeDocument(): MapDocument | undefined {
        return host._document;
      },
      async open(path: string): Promise<EditableMap> {
        if (!host._loadFile) {
          throw new Error(
            'tiled.open(): no loadFile callback configured on ScriptHost. ' +
              'Provide one in new ScriptHost({ loadFile: ... }) to read TMJ files.',
          );
        }
        const raw = await Promise.resolve(host._loadFile(path));
        const json = JSON.parse(raw);
        const map = readMapJson(json);
        const editable = host.wrapMapInternal(map);
        host._activeAsset = editable;
        return editable;
      },
      wrapMap(map: TiledMap): EditableMap {
        return host.wrapMapInternal(map);
      },
      alert(message: string, _title?: string): void {
        host._console.log(message);
      },
      warn(message: string, _title?: string): void {
        host._console.warn(message);
      },
      error(message: string, _title?: string): void {
        host._console.error(message);
      },
      log(message: string): void {
        host._console.log(message);
      },
      registerAction(id: string, callback: () => void): RegisteredAction {
        const action: RegisteredAction = { id, text: id, callback };
        host._actions.set(id, action);
        return action;
      },
      trigger(id: string): void {
        const action = host._actions.get(id);
        if (!action) {
          host._console.warn(`tiled.trigger(): unknown action "${id}"`);
          return;
        }
        action.callback();
      },
      registerTool(name: string, factory: ScriptedTool | (() => ScriptedTool)): void {
        host._tools.set(name, factory);
      },
      registerMapFormat(name: string, plugin: ScriptedMapFormat): void {
        host._mapFormats.set(name, plugin);
      },
      get actions(): string[] {
        return Array.from(host._actions.keys());
      },
      get tools(): string[] {
        return Array.from(host._tools.keys());
      },
      get mapFormats(): string[] {
        return Array.from(host._mapFormats.keys());
      },
    };
  }

  /** Configured console — accessible to host editors that want to drain it. */
  get console(): Console {
    return this._console;
  }

  /** Wrap a raw `Map` in an `EditableMap` bound to this host. */
  wrapMapInternal(map: TiledMap): EditableMap {
    const editable = new EditableMap(map);
    editable.host = this;
    return editable;
  }

  /** Current active MapDocument. Undefined when nothing is open. */
  activeDocument(): MapDocument | undefined {
    return this._document;
  }

  /** Swap the active map document. Re-wraps any active asset on top of the new doc. */
  setDocument(doc: MapDocument | undefined): void {
    this._document = doc;
    if (doc) {
      const editable = new EditableMap(doc.map);
      editable.host = this;
      this._activeAsset = editable;
    } else {
      this._activeAsset = undefined;
    }
  }

  /** Public alternative to `setDocument` for hosts that already have an EditableMap. */
  setActiveAsset(asset: EditableMap | undefined): void {
    this._activeAsset = asset;
  }

  /** Public action registration mirror — useful for host UIs that bypass scripts. */
  register(id: string, callback: () => void): RegisteredAction {
    return this.api.registerAction(id, callback);
  }

  /** Invoke a registered action by id. Returns true if found, false otherwise. */
  invoke(id: string): boolean {
    const a = this._actions.get(id);
    if (!a) return false;
    a.callback();
    return true;
  }

  /** Lookup a registered tool by name. */
  tool(name: string): ScriptedTool | (() => ScriptedTool) | undefined {
    return this._tools.get(name);
  }

  /** Lookup a registered map format by name. */
  mapFormat(name: string): ScriptedMapFormat | undefined {
    return this._mapFormats.get(name);
  }

  /**
   * Evaluate a snippet of JS with the `tiled` global and the Editable*
   * constructors injected as positional arguments. Returns whatever the
   * snippet evaluates to (the function-form return value).
   */
  runScript(source: string): unknown {
    // Declaring the same names as parameters shadows any host globals with the
    // matching identifiers (`process`, `require`, `globalThis`, etc.), giving
    // a clearer API surface to script authors without claiming we're a
    // security sandbox — see the file header.
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'tiled',
      'console',
      'EditableMap',
      'EditableLayer',
      'EditableTileLayer',
      'EditableObjectGroup',
      'EditableImageLayer',
      'EditableGroupLayer',
      'EditableMapObject',
      'EditableTileset',
      'EditableTile',
      'globalThis',
      'process',
      'require',
      'module',
      'exports',
      '__dirname',
      '__filename',
      // The script body itself.
      `'use strict';\nreturn (function(){ ${source}\n})();`,
    );
    return fn(
      this.api,
      this._console,
      EditableMap,
      EditableLayer,
      EditableTileLayer,
      EditableObjectGroup,
      EditableImageLayer,
      EditableGroupLayer,
      EditableMapObject,
      EditableTileset,
      EditableTile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  }
}
