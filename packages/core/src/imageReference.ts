// Port of libtiled/imagereference.h+cpp.
//
// In the web port, an `ImageReference` is *metadata only*: it describes where
// the image lives and how Tiled is meant to interpret it. Actually decoding
// pixels into a renderable surface is the renderer's job.

import type { ColorString, Size } from './types.js';
import { LoadingStatus } from './tiled.js';

export interface ImageReference {
  /** URL or relative path. Empty for image-collection tilesets. */
  source: string;
  /** Optional transparent-color key (e.g. `"#ff00ff"`). `undefined` = none. */
  transparentColor: ColorString | undefined;
  /** Image dimensions in pixels. `{ width: 0, height: 0 }` until loaded. */
  size: Size;
  /** Optional embedded format hint (e.g. `"png"`). */
  format: string;
  /** Optional embedded base64 / binary blob. */
  data: Uint8Array | undefined;
  status: LoadingStatus;
}

export function makeImageReference(): ImageReference {
  return {
    source: '',
    transparentColor: undefined,
    size: { width: 0, height: 0 },
    format: '',
    data: undefined,
    status: LoadingStatus.LoadingPending,
  };
}

export function imageReferenceHasImage(r: ImageReference): boolean {
  return Boolean(r.source) || (r.data !== undefined && r.data.length > 0);
}
