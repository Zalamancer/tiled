// Port of libtiled/compression.cpp.
//
// Tile-layer payloads in TMX/TMJ may be CSV, raw base64, or
// base64+gzip/zlib/zstd compressed. We support CSV + base64 + gzip + zlib via
// `pako`. Zstandard is not supported in the browser-friendly subset; callers
// fall back to base64-zlib in `LayerDataFormat.Base64Zstandard`.

import { LayerDataFormat } from '@tiled-ts/core';
import pako from 'pako';

export class CompressionError extends Error {}

/** Decode base64 (browser/Node-safe) into a `Uint8Array`. */
export function base64Decode(s: string): Uint8Array {
  const cleaned = s.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback
  return new Uint8Array(Buffer.from(cleaned, 'base64'));
}

export function base64Encode(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }
  return Buffer.from(bytes).toString('base64');
}

/** Encode a CSV gid sequence (comma-separated, no whitespace). */
export function csvEncode(gids: Uint32Array): string {
  return gids.join(',');
}

/** Decode a CSV string of comma-separated unsigned 32-bit gids. */
export function csvDecode(s: string): Uint32Array {
  const parts = s.split(',');
  const out = new Uint32Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const v = Number(parts[i]?.trim() ?? '0');
    if (!Number.isFinite(v)) throw new CompressionError(`invalid CSV value: ${parts[i]}`);
    out[i] = v >>> 0;
  }
  return out;
}

/** Encode a Uint32 array of gids in the format Tiled expects. Returns the
 *  string payload that goes into `<data>` / `"data"` / `<chunk>`. */
export function encodeGids(gids: Uint32Array, format: LayerDataFormat, level = -1): string {
  switch (format) {
    case LayerDataFormat.CSV:
      return csvEncode(gids);
    case LayerDataFormat.XML:
      // XML format embeds <tile gid="..."/> per cell; payload string unused.
      return '';
    case LayerDataFormat.Base64:
      return base64Encode(uint32ArrayToBytes(gids));
    case LayerDataFormat.Base64Zlib:
      return base64Encode(pako.deflate(uint32ArrayToBytes(gids), { level: clampLevel(level) }));
    case LayerDataFormat.Base64Gzip:
      return base64Encode(pako.gzip(uint32ArrayToBytes(gids), { level: clampLevel(level) }));
    case LayerDataFormat.Base64Zstandard:
      // Zstd not bundled in the format package — fall back to zlib.
      return base64Encode(pako.deflate(uint32ArrayToBytes(gids), { level: clampLevel(level) }));
  }
}

/** Inverse of `encodeGids`. */
export function decodeGids(payload: string, format: LayerDataFormat): Uint32Array {
  switch (format) {
    case LayerDataFormat.CSV:
      return csvDecode(payload);
    case LayerDataFormat.XML:
      throw new CompressionError('XML payload must be parsed via the XML reader');
    case LayerDataFormat.Base64:
      return bytesToUint32Array(base64Decode(payload));
    case LayerDataFormat.Base64Zlib:
      return bytesToUint32Array(pako.inflate(base64Decode(payload)));
    case LayerDataFormat.Base64Gzip:
      return bytesToUint32Array(pako.ungzip(base64Decode(payload)));
    case LayerDataFormat.Base64Zstandard:
      throw new CompressionError('zstd decompression is not bundled');
  }
}

function clampLevel(level: number): -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  if (level < 0) return -1;
  if (level > 9) return 9;
  return Math.round(level) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

function uint32ArrayToBytes(g: Uint32Array): Uint8Array {
  const out = new Uint8Array(g.length * 4);
  for (let i = 0; i < g.length; i++) {
    const v = g[i]!;
    const o = i * 4;
    out[o] = v & 0xff;
    out[o + 1] = (v >>> 8) & 0xff;
    out[o + 2] = (v >>> 16) & 0xff;
    out[o + 3] = (v >>> 24) & 0xff;
  }
  return out;
}

function bytesToUint32Array(bytes: Uint8Array): Uint32Array {
  if (bytes.length % 4 !== 0) {
    throw new CompressionError(`payload length not a multiple of 4: ${bytes.length}`);
  }
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = ((bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)) >>> 0);
  }
  return out;
}
