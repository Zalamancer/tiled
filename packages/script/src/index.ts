// Public API of @tiled-ts/script.
//
// Wraps the core data model with thin Editable* facades and exposes the
// `tiled` namespace that user scripts get. Mirrors the surface of upstream's
// QJSEngine-driven scripting API (`src/tiled/scriptmodule.{h,cpp}` and the
// `editable*.{h,cpp}` family). See `scriptHost.ts` for the threat model and
// caveats — this is *not* a security boundary.

export * from './console.js';
export * from './editableMap.js';
export * from './editableLayer.js';
export * from './editableTileLayer.js';
export * from './editableObjectGroup.js';
export * from './editableImageLayer.js';
export * from './editableGroupLayer.js';
export * from './editableMapObject.js';
export * from './editableTileset.js';
export * from './editableTile.js';
export * from './wrapLayer.js';
export * from './scriptHost.js';
