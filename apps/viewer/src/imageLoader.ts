// Default browser-side image loader for the viewer.
//
// Tries to load tileset images by URL (whatever the .tmj stored — usually a
// relative path). If loading fails we fall back to a 1×1 transparent texture
// so the rest of the map still renders without throwing.

import { Texture } from 'pixi.js';
import type { TextureSource } from 'pixi.js';
import type { ImageLoader as RenderImageLoader } from '@tiled-ts/render-pixi';

export type ImageLoader = RenderImageLoader;

export const defaultImageLoader: ImageLoader = async (src: string) => {
  // Fail gracefully if `Image` isn't available (e.g. some test envs).
  if (typeof Image === 'undefined') {
    return placeholderSource();
  }
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`load failed: ${src}`));
      img.src = src;
    });
    return Texture.from(img).source as TextureSource;
  } catch {
    return placeholderSource();
  }
};

function placeholderSource(): TextureSource {
  // `Texture.EMPTY` is a 1×1 transparent texture shipped with pixi — its
  // `source` is a fully-valid `TextureSource` we can hand back as a fallback.
  // `MapView` still slices this without throwing; affected tiles render blank.
  return Texture.EMPTY.source as TextureSource;
}
