// Hosts a `MapView` from @tiled-ts/render-pixi, forwards pointer events
// translated into map-pixel coordinates to the active tool.

import { useEffect, useRef } from 'react';

import { MapView, type ImageLoader } from '@tiled-ts/render-pixi';
import {
  type PointerButton,
  type Tool,
  type ToolContext,
  type ToolPointerEvent,
} from '@tiled-ts/tools';
import type { Map as TiledMap } from '@tiled-ts/core';

import { useActiveDoc, useEditor } from '../state/editorStore.js';
import { Texture } from 'pixi.js';

/** Resolves any `image:` URL to a 1×1 placeholder texture-source.
 *  Real apps would use Vite's `import.meta.url` or `Assets.load`. */
const defaultLoader: ImageLoader = async (src: string) => {
  if (typeof Image === 'undefined') {
    return { width: 16, height: 16, label: src } as never;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`load failed: ${src}`));
    img.src = src;
  });
  return (await Texture.from(img)).source as never;
};

export interface MapCanvasProps {
  imageLoader?: ImageLoader;
}

export function MapCanvas({ imageLoader = defaultLoader }: MapCanvasProps): JSX.Element {
  const doc = useActiveDoc();
  const tool = useEditor((s) => s.activeTool);
  const invalidate = useEditor((s) => s.invalidate);
  const version = useEditor((s) => s.version);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const toolRef = useRef<Tool | null>(null);
  toolRef.current = tool;

  useEffect(() => {
    if (!doc || !containerRef.current) return;
    const view = new MapView({ map: doc.map as TiledMap, loader: imageLoader });
    viewRef.current = view;
    view.init().then(() => {
      containerRef.current?.appendChild(view.app.canvas);
      // Resize to fit.
      const bbox = containerRef.current!.getBoundingClientRect();
      view.app.renderer.resize(bbox.width, bbox.height);
      const mapWidth = doc.map.width * doc.map.tileWidth;
      const mapHeight = doc.map.height * doc.map.tileHeight;
      const viewportX = mapWidth < bbox.width ? (mapWidth - bbox.width) / 2 : 0;
      const viewportY = mapHeight < bbox.height ? (mapHeight - bbox.height) / 2 : 0;
      view.setViewport(viewportX, viewportY, bbox.width, bbox.height);
    });
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [doc, imageLoader]);

  useEffect(() => {
    viewRef.current?.refresh();
  }, [version]);

  // Forward DOM pointer events into the active Tool.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !doc) return;
    const ctx: ToolContext = {
      doc,
      currentLayer: () => doc.currentLayer(),
      invalidate,
      push: (c) => doc.undoStack.push(c),
    };

    const eventFor = (e: PointerEvent, button?: PointerButton): ToolPointerEvent => {
      const rect = el.getBoundingClientRect();
      const view = viewRef.current;
      const scale = view?.app.stage.scale.x ?? 1;
      const position = {
        x: (e.clientX - rect.left - (view?.world.position.x ?? 0)) / scale,
        y: (e.clientY - rect.top - (view?.world.position.y ?? 0)) / scale,
      };
      const tw = doc.map.tileWidth || 1;
      const th = doc.map.tileHeight || 1;
      return {
        position,
        tilePos: { x: Math.floor(position.x / tw), y: Math.floor(position.y / th) },
        button,
        buttons: e.buttons,
        modifiers: {
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          alt: e.altKey,
          meta: e.metaKey,
        },
      };
    };

    toolRef.current?.activate(ctx);

    const onDown = (e: PointerEvent) => toolRef.current?.pointerDown(eventFor(e, buttonName(e.button)));
    const onMove = (e: PointerEvent) => toolRef.current?.pointerMove(eventFor(e));
    const onUp = (e: PointerEvent) => toolRef.current?.pointerUp(eventFor(e, buttonName(e.button)));
    const onLeave = () => toolRef.current?.pointerLeft();
    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('contextmenu', onContext);

    return () => {
      toolRef.current?.deactivate();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('contextmenu', onContext);
    };
  }, [doc, tool, invalidate]);

  return <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }} />;
}

function buttonName(button: number): PointerButton | undefined {
  if (button === 0) return 'left';
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return undefined;
}
