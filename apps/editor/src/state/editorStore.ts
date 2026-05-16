// Editor-wide state held in a Zustand store.
//
// The store wraps `MapDocument` instances (one per open tab), the active
// document index, the current tool, and a versioning counter that components
// subscribe to as a cheap way to react to mutations of the document tree.

import { create } from 'zustand';
import type { Map as TiledMap, Tileset, Tile, Layer } from '@tiled-ts/core';
import { PropertyTypes } from '@tiled-ts/core';
import { MapDocument } from '@tiled-ts/commands';
import {
  type Tool,
  StampBrush,
  BucketFillTool,
  EraserTool,
  ShapeFillTool,
  WangBrush,
  ObjectSelectionTool,
  CreateRectangleObjectTool,
  CreateEllipseObjectTool,
  CreatePointObjectTool,
  CreatePolygonObjectTool,
  CreatePolylineObjectTool,
  LayerOffsetTool,
  TileStamp,
} from '@tiled-ts/tools';

export interface ToolEntry {
  id: string;
  name: string;
  shortcut?: string;
  factory: () => Tool;
}

/** All tools the editor knows about. Order is what the toolbar shows. */
export const REGISTERED_TOOLS: ToolEntry[] = [
  { id: 'object-select', name: 'Select Objects', shortcut: 'S', factory: () => new ObjectSelectionTool() },
  { id: 'stamp', name: 'Stamp Brush', shortcut: 'B', factory: () => new StampBrush() },
  { id: 'bucket', name: 'Bucket Fill', shortcut: 'F', factory: () => new BucketFillTool() },
  { id: 'eraser', name: 'Eraser', shortcut: 'E', factory: () => new EraserTool() },
  { id: 'shape-rect', name: 'Shape Fill (Rect)', factory: () => Object.assign(new ShapeFillTool(), { shape: 'rectangle' as const }) },
  { id: 'shape-ellipse', name: 'Shape Fill (Ellipse)', factory: () => Object.assign(new ShapeFillTool(), { shape: 'ellipse' as const }) },
  { id: 'wang', name: 'Wang Brush', shortcut: 'W', factory: () => new WangBrush() },
  { id: 'create-rect', name: 'Insert Rectangle', shortcut: 'R', factory: () => new CreateRectangleObjectTool() },
  { id: 'create-ellipse', name: 'Insert Ellipse', factory: () => new CreateEllipseObjectTool() },
  { id: 'create-point', name: 'Insert Point', factory: () => new CreatePointObjectTool() },
  { id: 'create-polygon', name: 'Insert Polygon', factory: () => new CreatePolygonObjectTool() },
  { id: 'create-polyline', name: 'Insert Polyline', factory: () => new CreatePolylineObjectTool() },
  { id: 'layer-offset', name: 'Layer Offset', factory: () => new LayerOffsetTool() },
];

interface State {
  docs: MapDocument[];
  activeDocIndex: number;
  /** Bumped on every mutation so React components can re-render. */
  version: number;
  /** Selected tool id; the actual Tool instance is held in `activeTool`. */
  activeToolId: string;
  activeTool: Tool | null;
  /** Active stamp used by brush/fill tools. */
  stamp: TileStamp | null;
  selectedTile: Tile | null;
  selectedTileset: Tileset | null;
  /** Project-wide custom property types — shared by every open document. */
  propertyTypes: PropertyTypes;
}

interface Actions {
  addMap(map: TiledMap): void;
  closeMap(index: number): void;
  setActiveDoc(index: number): void;
  selectLayer(layer: Layer): void;
  setActiveTool(id: string): void;
  setStamp(stamp: TileStamp | null): void;
  setSelectedTile(tile: Tile | null, tileset?: Tileset | null): void;
  invalidate(): void;
}

export type EditorStore = State & Actions;

export const useEditor = create<EditorStore>((set, get) => ({
  docs: [],
  activeDocIndex: -1,
  version: 0,
  activeToolId: 'stamp',
  activeTool: null,
  stamp: null,
  selectedTile: null,
  selectedTileset: null,
  propertyTypes: new PropertyTypes(),

  addMap(map): void {
    const doc = new MapDocument(map);
    doc.undoStack.onChange(() => get().invalidate());
    doc.subscribe(() => get().invalidate());
    set((s) => ({
      docs: [...s.docs, doc],
      activeDocIndex: s.docs.length,
      version: s.version + 1,
    }));
  },

  closeMap(index): void {
    set((s) => {
      const docs = s.docs.filter((_, i) => i !== index);
      const ai = Math.min(s.activeDocIndex, docs.length - 1);
      return { docs, activeDocIndex: ai, version: s.version + 1 };
    });
  },

  setActiveDoc(index): void {
    set((s) => ({ activeDocIndex: index, version: s.version + 1 }));
  },

  selectLayer(layer): void {
    const doc = get().docs[get().activeDocIndex];
    if (!doc) return;
    doc.setCurrentLayer(layer);
    get().invalidate();
  },

  setActiveTool(id): void {
    const entry = REGISTERED_TOOLS.find((t) => t.id === id);
    if (!entry) return;
    set((s) => {
      s.activeTool?.deactivate();
      return { activeToolId: id, activeTool: entry.factory(), version: s.version + 1 };
    });
  },

  setStamp(stamp): void {
    set((s) => ({ stamp, version: s.version + 1 }));
  },

  setSelectedTile(tile, tileset): void {
    set((s) => ({
      selectedTile: tile,
      selectedTileset: tileset ?? tile?.tileset ?? null,
      version: s.version + 1,
    }));
  },

  invalidate(): void {
    set((s) => ({ version: s.version + 1 }));
  },
}));

/** Helper: pull out the active MapDocument. Returns `undefined` if none. */
export function useActiveDoc(): MapDocument | undefined {
  return useEditor((s) => s.docs[s.activeDocIndex]);
}
