// Port of libtiled/tiled.h — global enums, constants and tiny utilities.

import type { Size } from './types.js';
import { type Point, type Rect, type Margins } from './types.js';

export enum FlipDirection {
  FlipHorizontally = 0,
  FlipVertically = 1,
}

export enum RotateDirection {
  RotateLeft = 0,
  RotateRight = 1,
}

export enum Alignment {
  Unspecified = 0,
  TopLeft,
  Top,
  TopRight,
  Left,
  Center,
  Right,
  BottomLeft,
  Bottom,
  BottomRight,
}

export enum LoadingStatus {
  LoadingPending = 0,
  LoadingReady,
  LoadingInProgress,
  LoadingError,
}

export enum CompatibilityVersion {
  UnknownVersion = 0,
  Tiled_1_8 = 1080,
  Tiled_1_9 = 1090,
  Tiled_1_10 = 1100,
  Tiled_Current = 1100,
  Tiled_Latest = 65535,
}

/**
 * Composition / blend modes applied to layers. Numeric values match the
 * QPainter::CompositionMode constants in upstream Tiled so that the TMX
 * `<layer compositionop>` round-trip is byte-identical.
 */
export enum BlendMode {
  Normal = 0, // QPainter::CompositionMode_SourceOver
  Add = 30, // CompositionMode_Plus
  Multiply = 14, // CompositionMode_Multiply
  Screen = 13, // CompositionMode_Screen
  Overlay = 15, // CompositionMode_Overlay
  Darken = 16, // CompositionMode_Darken
  Lighten = 17, // CompositionMode_Lighten
  ColorDodge = 18, // CompositionMode_ColorDodge
  ColorBurn = 19, // CompositionMode_ColorBurn
  HardLight = 20, // CompositionMode_HardLight
  SoftLight = 21, // CompositionMode_SoftLight
  Difference = 22, // CompositionMode_Difference
  Exclusion = 23, // CompositionMode_Exclusion
}

export const CHUNK_SIZE = 16;
export const CHUNK_BITS = 4;
export const CHUNK_SIZE_MIN = 4;
export const CHUNK_MASK = CHUNK_SIZE - 1;

export const TILES_MIMETYPE = 'application/vnd.tile.list';
export const FRAMES_MIMETYPE = 'application/vnd.frame.list';
export const LAYERS_MIMETYPE = 'application/vnd.layer.list';
export const PROPERTIES_MIMETYPE = 'application/vnd.properties.list';
export const LIST_VALUES_MIMETYPE = 'application/vnd.list-values.list';

const ALIGNMENT_NAMES: Readonly<Record<Alignment, string>> = {
  [Alignment.Unspecified]: 'unspecified',
  [Alignment.TopLeft]: 'topleft',
  [Alignment.Top]: 'top',
  [Alignment.TopRight]: 'topright',
  [Alignment.Left]: 'left',
  [Alignment.Center]: 'center',
  [Alignment.Right]: 'right',
  [Alignment.BottomLeft]: 'bottomleft',
  [Alignment.Bottom]: 'bottom',
  [Alignment.BottomRight]: 'bottomright',
};

const ALIGNMENT_FROM_NAME: ReadonlyMap<string, Alignment> = new Map(
  Object.entries(ALIGNMENT_NAMES).map(([k, v]) => [v, Number(k) as Alignment]),
);

export function alignmentToString(a: Alignment): string {
  return ALIGNMENT_NAMES[a] ?? 'unspecified';
}

export function alignmentFromString(s: string): Alignment {
  return ALIGNMENT_FROM_NAME.get(s) ?? Alignment.Unspecified;
}

/**
 * Returns the offset that should be subtracted from the (0,0) origin to align
 * a box of `size` according to `alignment`. Mirrors `Tiled::alignmentOffset`.
 */
export function alignmentOffset(size: Size, alignment: Alignment): Point {
  let x = 0;
  let y = 0;
  switch (alignment) {
    case Alignment.TopLeft:
    case Alignment.Left:
    case Alignment.BottomLeft:
      x = 0;
      break;
    case Alignment.Top:
    case Alignment.Center:
    case Alignment.Bottom:
      x = size.width / 2;
      break;
    case Alignment.TopRight:
    case Alignment.Right:
    case Alignment.BottomRight:
      x = size.width;
      break;
    case Alignment.Unspecified:
      break;
  }
  switch (alignment) {
    case Alignment.TopLeft:
    case Alignment.Top:
    case Alignment.TopRight:
      y = 0;
      break;
    case Alignment.Left:
    case Alignment.Center:
    case Alignment.Right:
      y = size.height / 2;
      break;
    case Alignment.BottomLeft:
    case Alignment.Bottom:
    case Alignment.BottomRight:
      y = size.height;
      break;
    case Alignment.Unspecified:
      break;
  }
  return { x, y };
}

export function alignmentOffsetForRect(r: Rect, alignment: Alignment): Point {
  return alignmentOffset({ width: r.width, height: r.height }, alignment);
}

/**
 * Mirror-flips an alignment along the requested axis.
 *   - `flipAlignment(TopRight, FlipHorizontally) === TopLeft`
 *   - `flipAlignment(BottomLeft, FlipVertically) === TopLeft`
 */
export function flipAlignment(a: Alignment, dir: FlipDirection): Alignment {
  if (a === Alignment.Unspecified || a === Alignment.Center) return a;

  const horizontalFlip: Partial<Record<Alignment, Alignment>> = {
    [Alignment.TopLeft]: Alignment.TopRight,
    [Alignment.Top]: Alignment.Top,
    [Alignment.TopRight]: Alignment.TopLeft,
    [Alignment.Left]: Alignment.Right,
    [Alignment.Right]: Alignment.Left,
    [Alignment.BottomLeft]: Alignment.BottomRight,
    [Alignment.Bottom]: Alignment.Bottom,
    [Alignment.BottomRight]: Alignment.BottomLeft,
  };

  const verticalFlip: Partial<Record<Alignment, Alignment>> = {
    [Alignment.TopLeft]: Alignment.BottomLeft,
    [Alignment.Top]: Alignment.Bottom,
    [Alignment.TopRight]: Alignment.BottomRight,
    [Alignment.Left]: Alignment.Left,
    [Alignment.Right]: Alignment.Right,
    [Alignment.BottomLeft]: Alignment.TopLeft,
    [Alignment.Bottom]: Alignment.Top,
    [Alignment.BottomRight]: Alignment.TopRight,
  };

  const table = dir === FlipDirection.FlipHorizontally ? horizontalFlip : verticalFlip;
  return table[a] ?? a;
}

export function maxMargins(a: Margins, b: Margins): Margins {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

export function versionFromString(s: string): CompatibilityVersion {
  if (!s) return CompatibilityVersion.UnknownVersion;
  const parts = s.split('.').map((p) => parseInt(p, 10));
  if (parts.length === 0 || Number.isNaN(parts[0]!)) {
    return CompatibilityVersion.UnknownVersion;
  }
  const major = parts[0]!;
  const minor = parts[1] ?? 0;
  return (major * 1000 + minor * 10) as CompatibilityVersion;
}

const BLEND_MODE_NAMES: Readonly<Record<BlendMode, string>> = {
  [BlendMode.Normal]: 'normal',
  [BlendMode.Add]: 'add',
  [BlendMode.Multiply]: 'multiply',
  [BlendMode.Screen]: 'screen',
  [BlendMode.Overlay]: 'overlay',
  [BlendMode.Darken]: 'darken',
  [BlendMode.Lighten]: 'lighten',
  [BlendMode.ColorDodge]: 'color-dodge',
  [BlendMode.ColorBurn]: 'color-burn',
  [BlendMode.HardLight]: 'hard-light',
  [BlendMode.SoftLight]: 'soft-light',
  [BlendMode.Difference]: 'difference',
  [BlendMode.Exclusion]: 'exclusion',
};

const BLEND_MODE_FROM_NAME: ReadonlyMap<string, BlendMode> = new Map(
  Object.entries(BLEND_MODE_NAMES).map(([k, v]) => [v, Number(k) as BlendMode]),
);

export function blendModeToString(mode: BlendMode): string {
  return BLEND_MODE_NAMES[mode] ?? 'normal';
}

export function blendModeFromString(s: string): BlendMode {
  return BLEND_MODE_FROM_NAME.get(s) ?? BlendMode.Normal;
}
