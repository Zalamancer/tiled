// Public API of @tiled-ts/plugins — a curated port of Tiled's C++ map
// export plugins.

export * from './formatRegistry.js';

export * from './csv.js';
export * from './lua.js';
export * from './luaTableWriter.js';
export * from './luaTableReader.js';
export * from './json1.js';
export * from './defold.js';
export * from './gmx.js';
export * from './yy.js';
export * from './txt.js';

import { csvPlugin } from './csv.js';
import { luaPlugin } from './lua.js';
import { json1Plugin } from './json1.js';
import { defoldPlugin } from './defold.js';
import { gmxPlugin } from './gmx.js';
import { yyPlugin } from './yy.js';
import { txtPlugin } from './txt.js';
import { createDefaultRegistry, type FileFormat } from './formatRegistry.js';

/** Every plugin shipped by this package, in a deterministic order. */
export const builtinPlugins: readonly FileFormat[] = [
  csvPlugin,
  luaPlugin,
  json1Plugin,
  defoldPlugin,
  gmxPlugin,
  yyPlugin,
  txtPlugin,
];

/** Convenience: a `FormatRegistry` populated with every built-in plugin. */
export function createBuiltinRegistry() {
  return createDefaultRegistry(builtinPlugins);
}
