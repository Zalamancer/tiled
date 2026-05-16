// Hosts a `MapView` from @tiled-ts/render-pixi and wires viewer-only
// interactions: wheel-to-zoom and mouse-drag panning.

import { useEffect, useRef } from 'react';

import type { Map as TiledMap } from '@tiled-ts/core';
import { MapView } from '@tiled-ts/render-pixi';

import type { ImageLoader } from './imageLoader.js';

export interface MapCanvasProps {
  map: TiledMap;
  imageLoader: ImageLoader;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

export function MapCanvas({ map, imageLoader }: MapCanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let view: MapView | null = null;
    let cancelled = false;

    void (async () => {
      view = new MapView({ map, loader: imageLoader, backgroundColor: 0x111111 });
      if (cancelled) {
        view.destroy();
        return;
      }
      viewRef.current = view;
      await view.init();
      if (cancelled) {
        view.destroy();
        viewRef.current = null;
        return;
      }
      host.appendChild(view.app.canvas);
      const fitToHost = () => {
        if (!view) return;
        const bbox = host.getBoundingClientRect();
        view.app.renderer.resize(bbox.width || 1, bbox.height || 1);
        view.setViewport(0, 0, bbox.width || 1, bbox.height || 1);
      };
      fitToHost();
      const ro = new ResizeObserver(fitToHost);
      ro.observe(host);
      (view as unknown as { __resizeObserver: ResizeObserver }).__resizeObserver = ro;
    })();

    return () => {
      cancelled = true;
      const v = viewRef.current;
      if (v) {
        const ro = (v as unknown as { __resizeObserver?: ResizeObserver }).__resizeObserver;
        ro?.disconnect();
        v.destroy();
      }
      viewRef.current = null;
      scaleRef.current = 1;
      // Clear leftover DOM (the destroyed canvas).
      while (host.firstChild) host.removeChild(host.firstChild);
    };
  }, [map, imageLoader]);

  // Interactions: wheel zoom + drag pan.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const view = viewRef.current;
      if (!view) return;
      const rect = host.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const oldScale = scaleRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
      if (newScale === oldScale) return;
      // Keep the point under the cursor stationary in world space.
      const worldX = (px - view.world.position.x) / oldScale;
      const worldY = (py - view.world.position.y) / oldScale;
      view.setScale(newScale);
      scaleRef.current = newScale;
      view.world.position.set(px - worldX * newScale, py - worldY * newScale);
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const view = viewRef.current;
      if (!view) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      view.world.position.set(view.world.position.x + dx, view.world.position.y + dy);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      host.releasePointerCapture(e.pointerId);
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);

    return () => {
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      data-testid="viewer-canvas-host"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab' }}
    />
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
