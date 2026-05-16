// Port of libtiled/wangset.h+cpp.
//
// WangId is an 8 × 8-bit packed value, one byte per cardinal/diagonal index:
//
//      7 | 0 | 1
//      6 | . | 2
//      5 | 4 | 3
//
// We use BigInt because uint64 doesn't fit in a JS `number`. Most reads are
// `Number(...)` conversions of a single byte, so the BigInt overhead is
// negligible.

import { TiledObject, ObjectTypeId } from './object.js';
import type { ColorString } from './types.js';
import { RotateDirection } from './tiled.js';
import { Cell } from './cell.js';
import { cloneProperties } from './properties.js';
import { TransformationFlag, type Tileset } from './tileset.js';
import type { Tile } from './tile.js';

const BITS_PER_INDEX = 8n;
const INDEX_MASK = 0xffn;
const FULL_MASK = 0xffffffffffffffffn;
const NUM_CORNERS = 4;
const NUM_EDGES = 4;
const NUM_INDEXES = 8;
export const WANG_MAX_COLOR_COUNT = (1 << Number(BITS_PER_INDEX)) - 2; // 254

export enum WangIndex {
  Top = 0,
  TopRight = 1,
  Right = 2,
  BottomRight = 3,
  Bottom = 4,
  BottomLeft = 5,
  Left = 6,
  TopLeft = 7,
}

const _MaskTopLeft = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.TopLeft));
const _MaskTop = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.Top));
const _MaskTopRight = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.TopRight));
const _MaskRight = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.Right));
const _MaskBottomRight = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.BottomRight));
const _MaskBottom = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.Bottom));
const _MaskBottomLeft = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.BottomLeft));
const _MaskLeft = INDEX_MASK << (BITS_PER_INDEX * BigInt(WangIndex.Left));

export const WangIdMask = {
  TopLeft: _MaskTopLeft,
  Top: _MaskTop,
  TopRight: _MaskTopRight,
  Right: _MaskRight,
  BottomRight: _MaskBottomRight,
  Bottom: _MaskBottom,
  BottomLeft: _MaskBottomLeft,
  Left: _MaskLeft,
  Edges: _MaskTop | _MaskRight | _MaskBottom | _MaskLeft,
  Corners: _MaskTopRight | _MaskBottomRight | _MaskBottomLeft | _MaskTopLeft,
  Full: FULL_MASK,
} as const;

/**
 * `WangId` value object. All operators return *new* WangIds (immutable except
 * for `setIndexColor` for performance). The numeric value is held internally
 * as a `bigint`; `toBigInt()` is the round-trip back to that primitive.
 */
export class WangId {
  private _id: bigint;

  constructor(id: bigint | number = 0n) {
    this._id = typeof id === 'bigint' ? id : BigInt(id);
  }

  static readonly NumIndexes = NUM_INDEXES;
  static readonly NumCorners = NUM_CORNERS;
  static readonly NumEdges = NUM_EDGES;
  static readonly MAX_COLOR_COUNT = WANG_MAX_COLOR_COUNT;

  static empty(): WangId {
    return new WangId(0n);
  }

  toBigInt(): bigint {
    return this._id;
  }

  setId(id: bigint): void {
    this._id = id;
  }

  isEmpty(): boolean {
    return this._id === 0n;
  }

  /** Color at one of the 8 indexes. 0 = wildcard. */
  indexColor(index: number): number {
    return Number((this._id >> (BigInt(index) * BITS_PER_INDEX)) & INDEX_MASK);
  }
  edgeColor(index: number): number {
    return this.indexColor(index * 2);
  }
  cornerColor(index: number): number {
    return this.indexColor(index * 2 + 1);
  }

  setIndexColor(index: number, value: number): void {
    const shift = BigInt(index) * BITS_PER_INDEX;
    this._id = (this._id & ~(INDEX_MASK << shift)) | ((BigInt(value) & INDEX_MASK) << shift);
  }
  setEdgeColor(index: number, value: number): void {
    this.setIndexColor(index * 2, value);
  }
  setCornerColor(index: number, value: number): void {
    this.setIndexColor(index * 2 + 1, value);
  }
  setGridColor(x: number, y: number, value: number): void {
    const i = WangId.indexByGrid(x, y);
    if (i < NUM_INDEXES) this.setIndexColor(i, value);
  }

  hasWildCards(): boolean {
    for (let i = 0; i < NUM_INDEXES; i++) if (this.indexColor(i) === 0) return true;
    return false;
  }
  hasCornerWildCards(): boolean {
    for (let i = 0; i < NUM_CORNERS; i++) if (this.cornerColor(i) === 0) return true;
    return false;
  }
  hasEdgeWildCards(): boolean {
    for (let i = 0; i < NUM_EDGES; i++) if (this.edgeColor(i) === 0) return true;
    return false;
  }

  /** Mask that has 0xFF in every index whose color is non-zero. */
  mask(): WangId;
  /** Mask that has 0xFF in every index whose color equals `value`. */
  mask(value: number): WangId;
  mask(value?: number): WangId {
    let m = 0n;
    for (let i = 0; i < NUM_INDEXES; i++) {
      const c = this.indexColor(i);
      if (value === undefined ? c !== 0 : c === value) {
        m |= INDEX_MASK << (BigInt(i) * BITS_PER_INDEX);
      }
    }
    return new WangId(m);
  }

  hasCornerWithColor(value: number): boolean {
    for (let i = 0; i < NUM_CORNERS; i++) if (this.cornerColor(i) === value) return true;
    return false;
  }
  hasEdgeWithColor(value: number): boolean {
    for (let i = 0; i < NUM_EDGES; i++) if (this.edgeColor(i) === value) return true;
    return false;
  }

  /** Bitwise AND with a `bigint` mask, returning a new WangId. */
  and(mask: bigint): WangId {
    return new WangId(this._id & mask);
  }
  andEq(mask: bigint): void {
    this._id &= mask;
  }

  equals(other: WangId): boolean {
    return this._id === other._id;
  }

  mergeWith(wangId: WangId, mask: WangId): void {
    this._id = (this._id & ~mask._id) | (wangId._id & mask._id);
  }

  /**
   * Cardinal-aware update: re-aligns one half of the receiver based on the
   * `adjacent` neighbour at `position` (0 = top, 1 = top-right, …). When the
   * neighbour sits on an edge index (even position), the two corners between
   * us and them are also pulled in.
   */
  updateToAdjacent(adjacent: WangId, position: number): void {
    this.setIndexColor(position, adjacent.indexColor(WangId.oppositeIndex(position)));
    if (!WangId.isCorner(position)) {
      const cornerIndex = position / 2;
      this.setCornerColor(cornerIndex, adjacent.cornerColor((cornerIndex + 1) % NUM_CORNERS));
      this.setCornerColor(
        (cornerIndex + 3) % NUM_CORNERS,
        adjacent.cornerColor((cornerIndex + 2) % NUM_CORNERS),
      );
    }
  }

  rotated(rotations: number): WangId {
    let r = rotations < 0 ? 4 + (rotations % 4) : rotations % 4;
    const shift = BigInt(r) * BITS_PER_INDEX * 2n;
    const inv = (4n - BigInt(r)) * BITS_PER_INDEX * 2n;
    let rotated = (this._id << shift) & FULL_MASK;
    if (inv < 64n) rotated |= this._id >> inv;
    return new WangId(rotated & FULL_MASK);
  }

  rotate(rotations: number): void {
    this._id = this.rotated(rotations)._id;
  }

  flippedHorizontally(): WangId {
    const out = new WangId(this._id);
    out.setIndexColor(WangIndex.Right, this.indexColor(WangIndex.Left));
    out.setIndexColor(WangIndex.Left, this.indexColor(WangIndex.Right));
    for (let i = 0; i < NUM_CORNERS; i++) {
      out.setCornerColor(i, this.cornerColor(NUM_CORNERS - 1 - i));
    }
    return out;
  }
  flippedVertically(): WangId {
    return this.flippedHorizontally().rotated(2);
  }
  flipHorizontally(): void {
    this._id = this.flippedHorizontally()._id;
  }
  flipVertically(): void {
    this._id = this.flippedVertically()._id;
  }

  /** Convert to/from the legacy 4-bits-per-index 32-bit form. */
  static fromUint(u: number): WangId {
    let id = 0n;
    for (let i = 0; i < NUM_INDEXES; i++) {
      const c = BigInt((u >> (i * 4)) & 0xf);
      id |= c << (BigInt(i) * BITS_PER_INDEX);
    }
    return new WangId(id);
  }
  toUint(): number {
    let u = 0;
    for (let i = 0; i < NUM_INDEXES; i++) {
      const c = Number((this._id >> (BigInt(i) * BITS_PER_INDEX)) & INDEX_MASK);
      u |= c << (i * 4);
    }
    return u >>> 0;
  }

  toString(): string {
    const parts: string[] = [];
    for (let i = 0; i < NUM_INDEXES; i++) parts.push(String(this.indexColor(i)));
    return parts.join(',');
  }

  static fromString(s: string): { id: WangId; ok: boolean } {
    const parts = s.split(',');
    const id = new WangId();
    if (parts.length !== NUM_INDEXES) return { id, ok: false };
    for (let i = 0; i < NUM_INDEXES; i++) {
      const v = Number(parts[i]);
      if (!Number.isFinite(v) || v < 0 || v > WANG_MAX_COLOR_COUNT) {
        return { id: new WangId(), ok: false };
      }
      id.setIndexColor(i, v);
    }
    return { id, ok: true };
  }

  static indexByGrid(x: number, y: number): number {
    // Returns NUM_INDEXES (=8) for the centre cell.
    const map: ReadonlyArray<ReadonlyArray<number>> = [
      [WangIndex.TopLeft, WangIndex.Top, WangIndex.TopRight],
      [WangIndex.Left, NUM_INDEXES, WangIndex.Right],
      [WangIndex.BottomLeft, WangIndex.Bottom, WangIndex.BottomRight],
    ];
    return map[y]?.[x] ?? NUM_INDEXES;
  }
  static oppositeIndex(index: number): number {
    return (index + 4) % NUM_INDEXES;
  }
  static nextIndex(index: number): number {
    return (index + 1) % NUM_INDEXES;
  }
  static previousIndex(index: number): number {
    return (index + NUM_INDEXES - 1) % NUM_INDEXES;
  }
  static isCorner(index: number): boolean {
    return Boolean(index & 1);
  }
}

/* ───────────────────────── Wang colour & set ─────────────────────────── */

export interface WangTile {
  tileId: number;
  wangId: WangId;
}

const DEFAULT_WANG_COLORS: readonly ColorString[] = [
  '#ff0000', '#00ff00', '#0000ff', '#ff7700', '#00e9ff', '#ff00d8', '#ffff00',
  '#a000ff', '#00ffa1', '#ffa8a8', '#b4a8ff', '#96ffa7', '#8e7848', '#5a5a5a',
  '#0e7a46',
];

export class WangColor extends TiledObject {
  colorIndex: number;
  name: string;
  color: ColorString;
  imageId: number;
  probability: number;
  /** @internal */ wangSet: WangSet | null = null;
  /** @internal */ distanceToColor: number[] = [];

  constructor(
    colorIndex = 0,
    name = '',
    color: ColorString = '#ff0000',
    imageId = -1,
    probability = 1,
  ) {
    super(ObjectTypeId.WangColorType);
    this.colorIndex = colorIndex;
    this.name = name;
    this.color = color;
    this.imageId = imageId;
    this.probability = probability;
  }

  /** Transition penalty / minimum number of tiles between us and `targetColor`. */
  distanceTo(targetColor: number): number {
    return this.distanceToColor[targetColor] ?? -1;
  }
}

export enum WangSetType {
  Corner = 0,
  Edge = 1,
  Mixed = 2,
}

export interface WangIdAndCell {
  wangId: WangId;
  cell: Cell;
}

export class WangSet extends TiledObject {
  tileset: Tileset;
  name: string;
  imageTileId: number;

  private _type: WangSetType = WangSetType.Mixed;
  private _typeMask: WangId = new WangId(WangIdMask.Full);
  private _colors: WangColor[] = [];
  private _tileIdToWangId: Map<number, WangId> = new Map();
  private _wangIdAndCells: WangIdAndCell[] = [];
  private _uniqueFullWangIdCount = 0n;
  private _maximumColorDistance = 0;
  private _colorDistancesDirty = true;
  private _cellsDirty = true;
  private _lastSeenTransformationFlags = 0;

  constructor(tileset: Tileset, name: string, type: WangSetType, imageTileId = -1) {
    super(ObjectTypeId.WangSetType);
    this.tileset = tileset;
    this.name = name;
    this.imageTileId = imageTileId;
    this.setType(type);
  }

  get type(): WangSetType {
    return this._type;
  }
  setType(t: WangSetType): void {
    this._type = t;
    switch (t) {
      case WangSetType.Corner:
        this._typeMask = new WangId(WangIdMask.Corners);
        break;
      case WangSetType.Edge:
        this._typeMask = new WangId(WangIdMask.Edges);
        break;
      default:
        this._typeMask = new WangId(WangIdMask.Full);
    }
    this._colorDistancesDirty = true;
    this._cellsDirty = true;
  }
  typeMask(): WangId {
    return this._typeMask;
  }

  imageTile(): Tile | undefined {
    return this.tileset.findTile(this.imageTileId);
  }

  colorCount(): number {
    return this._colors.length;
  }

  setColorCount(n: number): void {
    if (n < 0 || n > WANG_MAX_COLOR_COUNT) {
      throw new RangeError(`color count out of range: ${n}`);
    }
    if (n === this.colorCount()) return;
    if (n < this.colorCount()) {
      this._colors.length = n;
    } else {
      while (this._colors.length < n) {
        const i = this._colors.length;
        const color = DEFAULT_WANG_COLORS[i] ?? randomColor();
        const wc = new WangColor(i + 1, '', color);
        wc.wangSet = this;
        this._colors.push(wc);
      }
    }
    this._colorDistancesDirty = true;
  }

  insertWangColor(wangColor: WangColor): void {
    if (this.colorCount() + 1 < wangColor.colorIndex) {
      throw new RangeError(
        `cannot insert WangColor at index ${wangColor.colorIndex} when colorCount is ${this.colorCount()}`,
      );
    }
    wangColor.wangSet = this;
    this._colors.splice(wangColor.colorIndex - 1, 0, wangColor);
    for (let i = wangColor.colorIndex; i < this.colorCount(); i++) {
      this._colors[i]!.colorIndex = i + 1;
    }
    this._colorDistancesDirty = true;
  }

  addWangColor(wangColor: WangColor): void {
    wangColor.colorIndex = this._colors.length + 1;
    this.insertWangColor(wangColor);
  }

  takeWangColorAt(color: number): WangColor | undefined {
    if (color <= 0 || color > this.colorCount()) return undefined;
    const [removed] = this._colors.splice(color - 1, 1);
    if (removed) removed.wangSet = null;
    for (let i = color - 1; i < this.colorCount(); i++) {
      this._colors[i]!.colorIndex = i + 1;
    }
    this._colorDistancesDirty = true;
    return removed;
  }

  colorAt(index: number): WangColor | undefined {
    return this._colors[index - 1];
  }

  colors(): readonly WangColor[] {
    return this._colors;
  }

  setWangId(tileId: number, wangId: WangId): void {
    if (!this.wangIdIsValid(wangId)) {
      throw new Error(`WangId ${wangId.toString()} is invalid for this set`);
    }
    const previous = this._tileIdToWangId.get(tileId);
    if (previous && previous.equals(wangId)) return;
    if (previous) this.removeTileId(tileId);
    if (wangId.isEmpty()) return;

    this._tileIdToWangId.set(tileId, wangId);
    this._colorDistancesDirty = true;
    this._cellsDirty = true;
  }

  removeTileId(tileId: number): void {
    if (!this._tileIdToWangId.delete(tileId)) return;
    this._colorDistancesDirty = true;
    this._cellsDirty = true;
  }

  wangIdByTileId(): ReadonlyMap<number, WangId> {
    return this._tileIdToWangId;
  }

  wangIdsAndCells(): readonly WangIdAndCell[] {
    if (this.cellsDirty()) this.recalculateCells();
    return this._wangIdAndCells;
  }

  sortedWangTiles(): WangTile[] {
    const list: WangTile[] = [];
    for (const [tileId, wangId] of this._tileIdToWangId) list.push({ tileId, wangId });
    list.sort((a, b) => a.tileId - b.tileId);
    return list;
  }

  wangIdOfTile(tile: Tile): WangId {
    if (tile.tileset !== this.tileset) return new WangId();
    return this._tileIdToWangId.get(tile.id) ?? new WangId();
  }

  wangIdOfCell(cell: Cell): WangId {
    let id = new WangId();
    if (cell.tileset === this.tileset) {
      id = this._tileIdToWangId.get(cell.tileId) ?? new WangId();
      if (cell.flippedAntiDiagonally()) {
        id.rotate(1);
        id.flipHorizontally();
      }
      if (cell.flippedHorizontally()) id.flipHorizontally();
      if (cell.flippedVertically()) id.flipVertically();
    }
    return id.and(this._typeMask.toBigInt());
  }

  /** Multiplicative aggregate of the per-color probabilities for `wangId`. */
  wangIdProbability(wangId: WangId): number {
    let p = 1;
    for (let i = 0; i < NUM_INDEXES; i++) {
      const c = wangId.indexColor(i);
      if (c) p *= this.colorAt(c)?.probability ?? 1;
    }
    return p;
  }

  wangIdIsValid(wangId: WangId): boolean {
    return WangSet.wangIdIsValid(wangId, this.colorCount());
  }
  static wangIdIsValid(wangId: WangId, colorCount: number): boolean {
    for (let i = 0; i < NUM_INDEXES; i++) {
      if (wangId.indexColor(i) > colorCount) return false;
    }
    return true;
  }

  /** Whether *some* registered wang id matches the given wang id under `mask`. */
  wangIdIsUsed(wangId: WangId, mask: WangId = new WangId(WangIdMask.Full)): boolean {
    const m = mask.toBigInt() & this._typeMask.toBigInt();
    const masked = wangId.and(m).toBigInt();
    for (const w of this.wangIdsAndCells()) {
      if (w.wangId.and(m).toBigInt() === masked) return true;
    }
    return false;
  }

  transitionPenalty(colorA: number, colorB: number): number {
    if (this._colorDistancesDirty) this.recalculateColorDistances();
    if (colorA === 0 && colorB === 0) return 0;
    if (colorA === 0) return this.colorAt(colorB)?.distanceToColor[colorA] ?? -1;
    return this.colorAt(colorA)?.distanceToColor[colorB] ?? -1;
  }
  maximumColorDistance(): number {
    if (this._colorDistancesDirty) this.recalculateColorDistances();
    return this._maximumColorDistance;
  }

  isEmpty(): boolean {
    return this._tileIdToWangId.size === 0;
  }
  isComplete(): boolean {
    if (this.cellsDirty()) this.recalculateCells();
    return this._uniqueFullWangIdCount === this.completeSetSize();
  }
  completeSetSize(): bigint {
    const c = BigInt(this.colorCount());
    return this._type === WangSetType.Mixed ? c ** 8n : c ** 4n;
  }

  effectiveTypeForColor(color: number): WangSetType {
    if (this._type !== WangSetType.Mixed) return this._type;
    let usedAsCorner = false;
    let usedAsEdge = false;
    if (color > 0 && color <= this.colorCount()) {
      for (const id of this._tileIdToWangId.values()) {
        for (let i = 0; i < NUM_INDEXES; i++) {
          if (id.indexColor(i) === color) {
            const corner = WangId.isCorner(i);
            usedAsCorner = usedAsCorner || corner;
            usedAsEdge = usedAsEdge || !corner;
          }
        }
      }
    }
    if (usedAsEdge === usedAsCorner) return WangSetType.Mixed;
    return usedAsEdge ? WangSetType.Edge : WangSetType.Corner;
  }

  templateWangIdAt(n: number): WangId {
    const c = this.colorCount();
    if (c <= 0) return new WangId();
    const id = new WangId();
    if (this._type === WangSetType.Corner) {
      for (let i = NUM_CORNERS - 1; i >= 0; i--) {
        const below = c ** i;
        const v = Math.floor(n / below);
        n -= v * below;
        id.setCornerColor(i, v + 1);
      }
    } else if (this._type === WangSetType.Edge) {
      for (let i = NUM_EDGES - 1; i >= 0; i--) {
        const below = c ** i;
        const v = Math.floor(n / below);
        n -= v * below;
        id.setEdgeColor(i, v + 1);
      }
    } else {
      for (let i = NUM_INDEXES - 1; i >= 0; i--) {
        const below = c ** i;
        const v = Math.floor(n / below);
        n -= v * below;
        id.setIndexColor(i, v + 1);
      }
    }
    return id;
  }

  clone(tileset: Tileset): WangSet {
    const c = new WangSet(tileset, this.name, this._type, this.imageTileId);
    c.setClassName(this.className);
    c.setProperties(cloneProperties(this.properties));
    c._uniqueFullWangIdCount = this._uniqueFullWangIdCount;
    c._maximumColorDistance = this._maximumColorDistance;
    c._colorDistancesDirty = this._colorDistancesDirty;
    c._cellsDirty = this._cellsDirty;
    c._lastSeenTransformationFlags = this._lastSeenTransformationFlags;
    for (const [tid, id] of this._tileIdToWangId) {
      c._tileIdToWangId.set(tid, new WangId(id.toBigInt()));
    }
    for (const wc of this._colors) {
      const cw = new WangColor(wc.colorIndex, wc.name, wc.color, wc.imageId, wc.probability);
      cw.setClassName(wc.className);
      cw.setProperties(cloneProperties(wc.properties));
      cw.distanceToColor = [...wc.distanceToColor];
      cw.wangSet = c;
      c._colors.push(cw);
    }
    return c;
  }

  /* ───────── private (recalculation) ───────── */

  private cellsDirty(): boolean {
    return this._cellsDirty || this._lastSeenTransformationFlags !== this.tileset.transformationFlags;
  }

  private recalculateCells(): void {
    this._wangIdAndCells = [];
    this._cellsDirty = false;
    this._uniqueFullWangIdCount = 0n;

    const mask = this._typeMask.toBigInt();
    const added = new Set<bigint>();

    for (const [tileId, raw] of this._tileIdToWangId) {
      const w = new WangId(raw.toBigInt() & mask);
      if (!w.hasWildCards() && !added.has(w.toBigInt())) this._uniqueFullWangIdCount += 1n;
      added.add(w.toBigInt());
      this._wangIdAndCells.push({ wangId: w, cell: new Cell(this.tileset, tileId) });
    }

    const flags = this.tileset.transformationFlags;
    this._lastSeenTransformationFlags = flags;

    if ((flags & ~TransformationFlag.PreferUntransformed) === 0) return;

    // Variations from rotation/flipping.
    for (const [tileId, raw] of this._tileIdToWangId) {
      const baseId = new WangId(raw.toBigInt() & mask);
      const baseHasWildcards = baseId.hasWildCards();

      const cells: Cell[] = [new Cell(this.tileset, tileId)];
      const ids: WangId[] = [baseId];
      let count = 1;

      if (flags & TransformationFlag.AllowRotate) {
        for (let i = 0; i < 3; i++) {
          const c = Cell.from(cells[i]!);
          c.rotate(RotateDirection.RotateRight);
          cells.push(c);
          ids.push(ids[i]!.rotated(1));
        }
        count = 4;
      }

      if (flags & TransformationFlag.AllowFlipHorizontally) {
        for (let i = 0; i < count; i++) {
          const c = Cell.from(cells[i]!);
          c.setFlippedHorizontally(!c.flippedHorizontally());
          cells.push(c);
          ids.push(ids[i]!.flippedHorizontally());
        }
        count *= 2;
      }

      if (count <= 4 && flags & TransformationFlag.AllowFlipVertically) {
        for (let i = 0; i < count; i++) {
          const c = Cell.from(cells[i]!);
          c.setFlippedVertically(!c.flippedVertically());
          cells.push(c);
          ids.push(ids[i]!.flippedVertically());
        }
        count *= 2;
      }

      for (let i = 1; i < count; i++) {
        const idi = ids[i]!;
        const exists = added.has(idi.toBigInt());
        if (flags & TransformationFlag.PreferUntransformed && exists) continue;
        if (!baseHasWildcards && !exists) this._uniqueFullWangIdCount += 1n;
        added.add(idi.toBigInt());
        this._wangIdAndCells.push({ wangId: idi, cell: cells[i]! });
      }
    }
  }

  private recalculateColorDistances(): void {
    let maximumDistance = 1;
    const cc = this.colorCount();
    for (let i = 1; i <= cc; i++) {
      const distance = new Array<number>(cc + 1).fill(-1);
      for (const raw of this._tileIdToWangId.values()) {
        const w = raw.and(this._typeMask.toBigInt());
        if (w.hasCornerWithColor(i)) {
          for (let idx = 0; idx < NUM_CORNERS; idx++) distance[w.cornerColor(idx)] = 1;
        }
        if (w.hasEdgeWithColor(i)) {
          for (let idx = 0; idx < NUM_EDGES; idx++) distance[w.edgeColor(idx)] = 1;
        }
      }
      distance[i] = 0;
      this.colorAt(i)!.distanceToColor = distance;
    }

    let newConnections = true;
    while (newConnections) {
      newConnections = false;
      for (let i = 1; i <= cc; i++) {
        const ci = this.colorAt(i)!;
        for (let j = 1; j <= cc; j++) {
          if (i === j) continue;
          const cj = this.colorAt(j)!;
          for (let t = 0; t <= cc; t++) {
            const d0 = ci.distanceToColor[t] ?? -1;
            const d1 = cj.distanceToColor[t] ?? -1;
            if (d0 === -1 || d1 === -1) continue;
            const existing = ci.distanceToColor[j] ?? -1;
            const candidate = d0 + d1;
            if (existing === -1 || candidate < existing) {
              ci.distanceToColor[j] = candidate;
              cj.distanceToColor[i] = candidate;
              if (candidate > maximumDistance) maximumDistance = candidate;
              newConnections = true;
            }
          }
        }
      }
    }
    this._maximumColorDistance = maximumDistance;
    this._colorDistancesDirty = false;
  }
}

function randomColor(): ColorString {
  const h = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `#${h}`;
}

export function wangSetTypeToString(t: WangSetType): string {
  return t === WangSetType.Corner ? 'corner' : t === WangSetType.Edge ? 'edge' : 'mixed';
}
export function wangSetTypeFromString(s: string): WangSetType {
  return s === 'corner' ? WangSetType.Corner : s === 'edge' ? WangSetType.Edge : WangSetType.Mixed;
}
