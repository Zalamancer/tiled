// Node port of `tmxrasterizer.cpp`.
//
// Loads a TMJ file plus its tileset images from the filesystem, composites
// every visible tile layer in render order onto a canvas, and writes a PNG.
//
// Limited subset for now:
//   * orthogonal maps only
//   * tile layers only (image- and object-layers ignored)
//   * no animation advancing, no parallax, no group-layer recursion-depth limit
//   * supports tile-flip flags (H, V, anti-diagonal)

import { promises as fs } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

import { MapOrientation } from '@tiled-ts/core';
import type { Cell, Layer, Map as TiledMap, Tileset } from '@tiled-ts/core';
import { readMapJson } from '@tiled-ts/format';
import { OrthogonalRendererMath } from '@tiled-ts/render-math';

// Canvas imports are localised here so `tsc` only needs the ambient shim if
// `@napi-rs/canvas` is not yet installed. The shim lives at `src/types/canvas.d.ts`.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Canvas, Image, SKRSContext2D } from '@napi-rs/canvas';

export interface RasterizeOptions {
  /** Input TMJ path. */
  input: string;
  /** Output PNG path. */
  output: string;
  /** Linear render scale; final pixel = mapPixel * scale. Default 1. */
  scale?: number;
  /** Hex background colour (e.g. `#000000`). Overrides map background. */
  background?: string;
}

export interface RasterizeResult {
  width: number;
  height: number;
  bytesWritten: number;
}

/**
 * Render a TMJ map to a PNG file. Returns the rasterised image dimensions and
 * the number of bytes written.
 */
export async function rasterize(opts: RasterizeOptions): Promise<RasterizeResult> {
  const scale = opts.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`invalid scale: ${opts.scale}`);
  }

  const absInput = resolvePath(opts.input);
  const text = await fs.readFile(absInput, 'utf8');
  const map = readMapJson(JSON.parse(text));

  if (map.orientation !== MapOrientation.Orthogonal) {
    throw new RasterizeNotSupportedError(
      `orientation "${orientationName(map.orientation)}" is not yet supported`,
    );
  }

  // Resolve every tileset's image relative to the map file.
  const mapDir = dirname(absInput);
  const images = new Map<Tileset, Image>();
  for (const ts of map.tilesets) {
    if (!ts.imageSource) continue; // Image-collection tilesets unsupported here.
    const absImg = resolvePath(mapDir, ts.imageSource);
    const buf = await fs.readFile(absImg);
    const img = await loadImage(buf);
    images.set(ts, img);
    // Ensure tileset column count is populated (TMJ may omit it).
    if (ts.columnCount === 0) {
      ts.setColumnCount(ts.columnCountForWidth(img.width));
    }
  }

  const math = new OrthogonalRendererMath(map);
  const bounds = math.mapBoundingRect();
  const width = Math.max(1, Math.ceil(bounds.width * scale));
  const height = Math.max(1, Math.ceil(bounds.height * scale));

  const canvas: Canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as SKRSContext2D;
  ctx.imageSmoothingEnabled = false;

  // Background fill.
  const bg = opts.background ?? map.backgroundColor;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.scale(scale, scale);

  for (const layer of map.layers) {
    drawLayer(ctx, layer, map, images);
  }

  const png = await canvas.encode('png');
  await fs.writeFile(opts.output, png);

  return { width, height, bytesWritten: png.byteLength };
}

/** Thrown when a feature path is recognised but not yet implemented. */
export class RasterizeNotSupportedError extends Error {
  override readonly name = 'RasterizeNotSupportedError';
}

function drawLayer(
  ctx: SKRSContext2D,
  layer: Layer,
  map: TiledMap,
  images: Map<Tileset, Image>,
): void {
  if (!layer.visible) return;
  if (layer.isGroupLayer()) {
    for (const child of layer.layers) drawLayer(ctx, child, map, images);
    return;
  }
  if (!layer.isTileLayer()) return; // object/image layers deferred.

  const tl = layer;
  const tw = map.tileWidth;
  const th = map.tileHeight;

  ctx.save();
  ctx.globalAlpha = tl.effectiveOpacity();

  for (const { x, y, cell } of tl.cells()) {
    if (cell.isEmpty()) continue;
    drawCell(ctx, cell, (tl.x + x) * tw, (tl.y + y) * th, tw, th, images);
  }

  ctx.restore();
}

function drawCell(
  ctx: SKRSContext2D,
  cell: Cell,
  destX: number,
  destY: number,
  cellW: number,
  cellH: number,
  images: Map<Tileset, Image>,
): void {
  const ts = cell.tileset;
  if (!ts) return;
  const img = images.get(ts);
  if (!img) return; // unsupported tileset (e.g. image collection); skip silently.

  const tile = ts.findTile(cell.tileId);
  let sx = 0;
  let sy = 0;
  const sw = ts.tileWidth;
  const sh = ts.tileHeight;
  if (tile && tile.imageRect.width > 0) {
    sx = tile.imageRect.x;
    sy = tile.imageRect.y;
  } else {
    const cols = ts.columnCount > 0 ? ts.columnCount : 1;
    const col = cell.tileId % cols;
    const row = Math.floor(cell.tileId / cols);
    sx = ts.margin + col * (ts.tileWidth + ts.tileSpacing);
    sy = ts.margin + row * (ts.tileHeight + ts.tileSpacing);
  }

  // Tile size on the destination may differ if the tileset's tile is taller
  // than the map's tile (Tiled draws tile-anchored to bottom-left). We follow
  // upstream and align bottom-left to (destX, destY+cellH).
  const dw = sw;
  const dh = sh;
  const dx = destX + ts.tileOffset.x;
  const dy = destY + ts.tileOffset.y + (cellH - dh);

  const flipH = cell.flippedHorizontally();
  const flipV = cell.flippedVertically();
  const flipAD = cell.flippedAntiDiagonally();

  if (!flipH && !flipV && !flipAD) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }

  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  if (flipAD) {
    // 90° rotation + swap of one flip axis, matching Tiled's flag semantics.
    ctx.rotate(Math.PI / 2);
    ctx.scale(flipV ? -1 : 1, flipH ? 1 : -1);
  } else {
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  }
  ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function orientationName(o: MapOrientation): string {
  switch (o) {
    case MapOrientation.Orthogonal:
      return 'orthogonal';
    case MapOrientation.Isometric:
      return 'isometric';
    case MapOrientation.Staggered:
      return 'staggered';
    case MapOrientation.Hexagonal:
      return 'hexagonal';
    case MapOrientation.Oblique:
      return 'oblique';
    default:
      return 'unknown';
  }
}
