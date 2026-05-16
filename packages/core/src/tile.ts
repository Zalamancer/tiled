// Port of libtiled/tile.h+cpp.
//
// In Qt, `Tile::image()` returns a `QPixmap`. The web has no equivalent direct
// surface, so the core package keeps Tile *metadata-only*: `imageSource`,
// `imageRect`, animation frames, custom properties, status. Materialising the
// pixmap into a texture is the job of `@tiled-ts/render-pixi`.

import { TiledObject, ObjectTypeId } from './object.js';
import { type Point, type Rect, type Size } from './types.js';
import { LoadingStatus } from './tiled.js';
import { cloneProperties } from './properties.js';

import type { Tileset } from './tileset.js';
import type { ObjectGroup } from './objectgroup.js';

/** One frame of an animated tile. */
export interface Frame {
  tileId: number;
  duration: number;
}

export class Tile extends TiledObject {
  private readonly _id: number;
  tileset: Tileset;

  /** Optional individual image (image-collection tilesets). */
  imageSource = '';
  /** Source-rect inside the tileset image (in pixels). */
  imageRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  imageStatus: LoadingStatus = LoadingStatus.LoadingReady;
  probability = 1;
  frames: Frame[] = [];
  objectGroup: ObjectGroup | undefined = undefined;

  private _currentFrameIndex = 0;
  private _unusedTime = 0;

  constructor(id: number, tileset: Tileset) {
    super(ObjectTypeId.TileType);
    this._id = id;
    this.tileset = tileset;
  }

  get id(): number {
    return this._id;
  }

  /** Python-API alias for `className`. */
  get type(): string {
    return this.className;
  }
  setType(t: string): void {
    this.setClassName(t);
  }

  get width(): number {
    return this.imageRect.width;
  }
  get height(): number {
    return this.imageRect.height;
  }
  get size(): Size {
    return { width: this.imageRect.width, height: this.imageRect.height };
  }

  /** Drawing offset — currently inherits from the tileset. */
  get offset(): Point {
    return this.tileset.tileOffset;
  }

  isAnimated(): boolean {
    return this.frames.length > 0;
  }
  currentFrameIndex(): number {
    return this._currentFrameIndex;
  }

  setFrames(frames: Frame[]): void {
    this.resetAnimation();
    this.frames = frames.slice();
  }

  /** Reset animation to first frame. Returns whether the rendered tile-id changed. */
  resetAnimation(): boolean {
    if (!this.isAnimated()) return false;
    const previous = this.frames[this._currentFrameIndex]!.tileId;
    this._currentFrameIndex = 0;
    this._unusedTime = 0;
    return previous !== this.frames[0]!.tileId;
  }

  /** Advance animation by `ms` milliseconds. Returns whether the tile-id changed. */
  advanceAnimation(ms: number): boolean {
    if (!this.isAnimated()) return false;
    this._unusedTime += ms;

    let frame = this.frames[this._currentFrameIndex]!;
    const previousTileId = frame.tileId;

    while (frame.duration > 0 && this._unusedTime > frame.duration) {
      this._unusedTime -= frame.duration;
      this._currentFrameIndex = (this._currentFrameIndex + 1) % this.frames.length;
      frame = this.frames[this._currentFrameIndex]!;
    }
    return previousTileId !== frame.tileId;
  }

  /** Returns the actually-rendered tile (resolves the animation pointer). */
  currentFrameTile(): Tile | undefined {
    if (this.isAnimated()) {
      const frame = this.frames[this._currentFrameIndex]!;
      return this.tileset.findTile(frame.tileId);
    }
    return this;
  }

  setImageRect(r: Rect): void {
    this.imageRect = r;
  }

  /** @internal — mutated only by `Tileset.takeTileAt` / format readers. */
  setId(id: number): void {
    (this as unknown as { _id: number })._id = id;
  }

  clone(tileset: Tileset): Tile {
    const c = new Tile(this._id, tileset);
    c.setClassName(this.className);
    c.setProperties(cloneProperties(this.properties));
    c.imageSource = this.imageSource;
    c.imageRect = { ...this.imageRect };
    c.imageStatus = this.imageStatus;
    c.probability = this.probability;
    c.frames = this.frames.map((f) => ({ ...f }));
    c._currentFrameIndex = this._currentFrameIndex;
    c._unusedTime = this._unusedTime;
    if (this.objectGroup) c.objectGroup = this.objectGroup.clone() as ObjectGroup;
    return c;
  }
}
