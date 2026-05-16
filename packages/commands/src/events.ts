// Event types emitted by MapDocument when commands mutate the model.
//
// Inspired by src/tiled/changeevents.h: events are *structural* (a layer was
// added) or *attribute* (a layer's opacity changed). UI panels subscribe to
// these to invalidate caches and re-render.

import type {
  GroupLayer,
  Layer,
  Map as TiledMap,
  MapObject,
  ObjectGroup,
  Tile,
  Tileset,
  WangColor,
  WangSet,
} from '@tiled-ts/core';

export interface LayerAddedEvent {
  kind: 'layer-added';
  map: TiledMap;
  layer: Layer;
  parent: GroupLayer | undefined;
  index: number;
}
export interface LayerAboutToBeRemovedEvent {
  kind: 'layer-about-to-be-removed';
  map: TiledMap;
  layer: Layer;
}
export interface LayerRemovedEvent {
  kind: 'layer-removed';
  map: TiledMap;
  layer: Layer;
}
export interface LayerChangedEvent {
  kind: 'layer-changed';
  map: TiledMap;
  layer: Layer;
  properties: number; // bitfield of MapObjectChangedProperty-style flags
}
export interface MapChangedEvent {
  kind: 'map-changed';
  map: TiledMap;
  /** Diff bitmask; left as `unknown` to allow downstream typing. */
  property?: string;
}
export interface MapObjectsAddedEvent {
  kind: 'objects-added';
  map: TiledMap;
  objectGroup: ObjectGroup;
  objects: MapObject[];
}
export interface MapObjectsRemovedEvent {
  kind: 'objects-removed';
  map: TiledMap;
  objectGroup: ObjectGroup;
  objects: MapObject[];
}
export interface MapObjectsChangedEvent {
  kind: 'objects-changed';
  map: TiledMap;
  objects: MapObject[];
  properties: number;
}
export interface TilesetsChangedEvent {
  kind: 'tilesets-changed';
  map: TiledMap;
}
export interface TileChangedEvent {
  kind: 'tile-changed';
  tile: Tile;
  property: string;
}
export interface PropertiesChangedEvent {
  kind: 'properties-changed';
  /** Whatever object owns the property bag — Map, Layer, Tileset, ... */
  target: unknown;
}
export interface WangSetChangedEvent {
  kind: 'wangset-changed';
  tileset: Tileset;
  wangSet: WangSet;
}
export interface WangColorChangedEvent {
  kind: 'wangcolor-changed';
  tileset: Tileset;
  wangColor: WangColor;
}

export type ChangeEvent =
  | LayerAddedEvent
  | LayerAboutToBeRemovedEvent
  | LayerRemovedEvent
  | LayerChangedEvent
  | MapChangedEvent
  | MapObjectsAddedEvent
  | MapObjectsRemovedEvent
  | MapObjectsChangedEvent
  | TilesetsChangedEvent
  | TileChangedEvent
  | PropertiesChangedEvent
  | WangSetChangedEvent
  | WangColorChangedEvent;

export type ChangeEventListener = (e: ChangeEvent) => void;
