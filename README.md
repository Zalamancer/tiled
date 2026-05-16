# tiled-ts

A TypeScript-for-the-web port of [Tiled](https://github.com/mapeditor/tiled), the
general-purpose tile map editor by Thorbjørn Lindeijer and contributors.

Status: **end-to-end runnable**. 12 workspaces, 202 vitest cases, all green.
Upstream Qt/C++ is mirrored under `reference/` (git-ignored).

## Phase progress

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 0 — pnpm monorepo scaffold                          | ✅ done  | 4 workspaces, project-references TS, vitest |
| 1 — `libtiled` core data model                      | ✅ done  | 31 tests; Cell/Chunk/TileLayer, Map, Tileset, WangSet/WangId (BigInt-backed), MapObject, ObjectGroup, ImageLayer, GroupLayer, Hex, Properties, GidMapper, TileRegion |
| 2 — coordinate-conversion math                      | ✅ done  | 7 tests; Orthogonal / Isometric / Hexagonal / Staggered / Oblique |
| 3 — TMJ (Tiled JSON) reader + writer                | ✅ done  | 3 tests; round-trips tilelayers (CSV + base64 + zlib + gzip), object groups, image layers, group layers, properties, wangsets |
| 4 — PixiJS v8 map view + brush preview              | ✅ done  | 15 tests; TextureCache, TileLayerView with viewport culling, ObjectGroupView (shapes + tile-objects + text), ImageLayerView (TilingSprite repeat), MapView orchestrator, BrushItem preview, MinimapRenderer, TileAnimationDriver |
| 5 — Undo/redo command framework                     | ✅ done  | 24 tests; UndoStack (push/undo/redo/merge/macros/clean), MapDocument with EventBus, AddRemoveLayer, MoveLayer, ChangeLayer{Name,Visible,Locked,Opacity,Offset,ParallaxFactor,TintColor}, PaintTileLayer (stroke merging), EraseTilesCommand, AddRemoveMapObject, ChangeMapObject{Name,Class,Visible,Position,Size,Rotation,Shape}, AddRemoveTileset, MoveTileset, Set/Remove/RenameProperty, AddRemoveWangSet, SetWangSet{Name,Type,ColorCount}, SetTileWangId, SetMap{BackgroundColor,TileSize,Orientation,RenderOrder,Infinite}, ResizeMap |
| 6 — Painting tools (stamp, fill, eraser, wang)      | ✅ done  | 17 tests; Tool + ToolContext base, RandomPicker, TileStamp (weighted variations), floodFillRegion, StampBrush (drag-merge), BucketFillTool (4-connected; tile/random/wang fills), EraserTool, ShapeFillTool (rect/ellipse), WangFiller (best-match via transitionPenalty), WangBrush (corner/edge/mixed), SelectSameTileTool |
| 6b — Object tools                                   | ✅ done  | 15 tests; hit-testing (rect/ellipse/point/polygon/polyline), AbstractObjectTool, ObjectSelectionTool (click/shift-toggle/marquee + drag-move with undo), CreateObjectTool base + Rectangle/Ellipse/Point/Polygon/Polyline/Tile creators, EditPolygonTool (vertex drag/Esc-revert), LayerOffsetTool (commits one undo on release) |
| 7 — Editor UI shell (React)                         | ✅ done  | 15 tests; React + Vite + Zustand store, Toolbar (new/open/save/undo/redo TMJ), MapTabs, ToolPalette, StatusBar, MapCanvas (PixiJS host + DOM-pointer→Tool bridge), LayerDock (visibility/lock/opacity/rename/reorder/remove via commands), TilesetDock (tile picker → TileStamp), UndoDock (clickable history), PropertiesDock, MinimapDock. `pnpm --filter @tiled-ts/editor dev` starts the app. |
| 7b — Property editor + custom types                 | ✅ done  | 17 tests; core `setPropertyMemberValue`/`getPropertyMemberValue` for nested paths, `SetPropertyMember` command (merging), React `PropertyValueInput` switching on `value.kind` (string/int/float/bool/color+alpha/file/object/class-recursive/enum dropdown or flag-checkboxes), `PropertyEditor` (rename/remove/+add with builtin + user types), `ObjectTypesEditor` modal (class & enum CRUD, member management, storage/flags toggles) wired into Toolbar |
| 7c — Tile animation + collision editors             | ✅ done  | 12 tests; commands `ChangeTileAnimation`, `ChangeTileProbability` (merging), `ChangeTileType`, `ChangeTileObjectGroup` (clone-on-apply); React `TileAnimationEditor` (frame list + live `requestAnimationFrame` preview) and `TileCollisionEditor` (SVG canvas with overlay shapes; rect/ellipse/point creators with x/y/w/h fields), launched from per-tile buttons in TilesetDock |
| 8 — Automapping engine                              | ✅ done  | 8 tests; `AutoMapper.fromRulesMap` parses `input*` / `inputnot*` / `output*` layer naming with `_setName` grouping, derives 4-connected rule regions, weighted multi-variation outputs (injectable RNG); `AutoMapResult` feeds into `PaintTileLayer`; `AutoMappingManager` runs ordered rule sets |
| 9 — Plugin/exporter ports (csv/lua/defold/...)      | ✅ done  | 17 tests; `FileFormat` registry; **round-trip**: CSV (tileset-aware reader, flip-flag bits), Lua (hand-written Lua-table parser); **write-only**: JSON1 (legacy flat-layer schema), Defold `.tilemap`, GameMaker Studio 1.x GMX XML, GameMaker Studio 2 YY JSON, human-readable TXT |
| 10 — `tmxrasterizer` CLI + viewer                   | ✅ done  | 9 tests; **`apps/cli`** Node bin `tiled-ts rasterize` reads TMJ via `@tiled-ts/format`, composes orthogonal layers with `OrthogonalRendererMath`, applies all flip flags, emits PNG via `@napi-rs/canvas` (`-o`, `-s/--scale`, `--bg`, `--help`); **`apps/viewer`** Vite SPA file-input → `MapView` with wheel-zoom and drag-to-pan |
| 11 — Sandboxed scripting API                        | ✅ done  | 12 tests; `ScriptHost` runs user JS in a `new Function` sandbox with shadowed Node globals; `tiled` namespace (`version`, `activeAsset`, `open`, `alert`/`warn`/`error`/`log`, `registerAction`/`registerTool`/`registerMapFormat`); full `Editable*` wrapper set (Map, Layer + Tile/Object/Image/Group subtypes, Tileset, Tile, MapObject) that mutates via undo commands when a doc is active |

Run `pnpm test` to execute the 202-test suite, or `pnpm build` to compile all
packages. `pnpm dev` boots the editor at <http://localhost:5173>; the
stand-alone viewer is on `:5174`; the CLI is `pnpm --filter @tiled-ts/cli build && node apps/cli/dist/bin.js rasterize map.tmj -o out.png`.

## Packages

| Workspace                  | Purpose                                       | Maps to Tiled C++                          |
| -------------------------- | --------------------------------------------- | ------------------------------------------ |
| `@tiled-ts/core`           | Map/layer/tile/tileset/object data model      | `src/libtiled` (data classes)              |
| `@tiled-ts/render-math`    | Orthogonal / iso / staggered / hex math       | `src/libtiled/*renderer.cpp`               |
| `@tiled-ts/format`         | TMX / TMJ / TSX read & write                  | `src/libtiled/map*reader/writer*`          |
| `@tiled-ts/render-pixi`    | PixiJS v8 map view, brush preview, animations | `src/tiled/brushitem`, `tileanimation*`    |
| `@tiled-ts/commands`       | Undo/redo command framework                   | `src/tiled/addremove*`, `change*`          |
| `@tiled-ts/tools`          | Stamp, fill, eraser, wang, terrain brushes    | `src/tiled/*tool.{h,cpp}`                  |
| `@tiled-ts/automap`        | Automapping engine                            | `src/tiled/automap*`                       |
| `@tiled-ts/plugins`        | Format plugins (CSV, Lua, JSON1, Defold, …)   | `src/plugins/*`                            |
| `@tiled-ts/script`         | Sandboxed scripting API                       | `src/tiled/script*`                        |
| `apps/editor`              | React + Vite web editor                       | `src/tiled` (UI)                           |
| `apps/cli`                 | Node CLI (tmxrasterizer)                      | `src/tmxrasterizer`                        |
| `apps/viewer`              | Stand-alone TMX viewer                        | `src/tmxviewer`                            |

## License

GPL-2.0-or-later, same as upstream Tiled. See `LICENSE.GPL` (will be copied from
upstream once a tagged release base is fixed).
