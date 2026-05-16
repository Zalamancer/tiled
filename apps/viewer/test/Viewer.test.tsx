import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Map as TiledMap, TileLayer, Tileset } from '@tiled-ts/core';

import { Viewer } from '../src/Viewer.js';
import type { ImageLoader } from '../src/imageLoader.js';

// Mock @tiled-ts/render-pixi so the viewer can mount under happy-dom without
// pulling in WebGL. The mock records constructor calls and is asserted below.
const constructorCalls: unknown[] = [];

vi.mock('@tiled-ts/render-pixi', () => {
  return {
    MapView: class MockMapView {
      readonly app = {
        canvas: typeof document === 'undefined' ? null : document.createElement('canvas'),
        renderer: { resize: vi.fn() },
      };
      readonly world = { position: { x: 0, y: 0, set: vi.fn() }, scale: { x: 1 } };
      constructor(opts: unknown) {
        constructorCalls.push(opts);
      }
      async init(): Promise<void> {}
      setViewport(): void {}
      setScale(): void {}
      destroy(): void {}
    },
  };
});

function sampleMap(): TiledMap {
  const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
  const ts = new Tileset('terrain', 16, 16);
  for (let i = 0; i < 4; i++) ts.findOrCreateTile(i);
  map.addTileset(ts);
  map.addLayer(new TileLayer('main', 0, 0, 4, 4));
  return map;
}

beforeEach(() => {
  constructorCalls.length = 0;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    // happy-dom doesn't provide ResizeObserver; supply a stub.
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

afterEach(() => cleanup());

describe('Viewer', () => {
  it('renders the file-picker empty state when no map is loaded', () => {
    render(<Viewer />);
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('instantiates a MapView when given an initial map', async () => {
    // The loader is never invoked (we mock MapView), so any cast satisfies it.
    const dummyLoader = (async () => ({ width: 1, height: 1 })) as unknown as ImageLoader;
    render(<Viewer initialMap={sampleMap()} imageLoader={dummyLoader} />);
    // The MockMapView is constructed synchronously in the canvas effect.
    await new Promise((r) => setTimeout(r, 0));
    expect(constructorCalls.length).toBe(1);
    expect(screen.getByTestId('viewer-canvas-host')).toBeTruthy();
  });
});
