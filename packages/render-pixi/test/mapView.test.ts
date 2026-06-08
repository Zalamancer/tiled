import { describe, expect, it, vi } from 'vitest';

import { Cell, GroupLayer, Map as TiledMap, TileLayer, Tileset } from '@tiled-ts/core';
import { MapView } from '../src/mapView.js';

const pixi = vi.hoisted(() => {
  class FakeContainer {
    children: FakeContainer[] = [];
    label = '';
    alpha = 1;
    visible = true;
    tint: unknown;
    blendMode: unknown;
    rotation = 0;
    position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
    scale = { x: 1, y: 1, set: (x: number, y = x) => { this.scale.x = x; this.scale.y = y; } };

    addChild<T extends FakeContainer>(child: T): T {
      this.children.push(child);
      return child;
    }

    removeChild(child: FakeContainer): void {
      this.children = this.children.filter((existing) => existing !== child);
    }

    removeChildren(): void {
      this.children = [];
    }

    destroy(): void {
      this.children = [];
    }
  }

  class FakeApplication {
    stage = new FakeContainer();
    canvas = {};
    renderer = { resize: vi.fn() };

    async init(): Promise<void> {}
    destroy(): void {}
  }

  class FakeSprite extends FakeContainer {
    anchor = { set: vi.fn() };
    texture: unknown;
  }

  class FakeTexture {
    static EMPTY = { label: 'EMPTY' };
    label = '';

    constructor(opts: { label?: string } = {}) {
      this.label = opts.label ?? '';
    }
  }

  class FakeRectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }

  class FakeGraphics extends FakeContainer {
    rect(): this { return this; }
    ellipse(): this { return this; }
    circle(): this { return this; }
    roundRect(): this { return this; }
    moveTo(): this { return this; }
    lineTo(): this { return this; }
    closePath(): this { return this; }
    stroke(): this { return this; }
  }

  class FakeTicker {
    deltaMS = 0;
    add(): void {}
    remove(): void {}
    start(): void {}
    stop(): void {}
    destroy(): void {}
  }

  return {
    Application: FakeApplication,
    Container: FakeContainer,
    Graphics: FakeGraphics,
    ImageSource: class {},
    Rectangle: FakeRectangle,
    Sprite: FakeSprite,
    Text: FakeContainer,
    Texture: FakeTexture,
    Ticker: FakeTicker,
    TilingSprite: FakeSprite,
  };
});

vi.mock('pixi.js', () => pixi);

describe('MapView', () => {
  it('parents nested layer views under their group layer view', async () => {
    const map = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    const ts = new Tileset('terrain', 16, 16);
    ts.findOrCreateTile(0);
    map.addTileset(ts);

    const group = new GroupLayer('Shadows');
    group.opacity = 0.25;
    const child = new TileLayer('Shadow tiles', 0, 0, 1, 1);
    child.setCell(0, 0, new Cell(ts, 0));
    group.addLayer(child);
    map.addLayer(group);

    const view = new MapView({
      map,
      autoStartAnimations: false,
      loader: async () => ({ width: 16, height: 16, label: 'fake' }) as never,
    });

    await view.init();
    const groupView = view.world.children.find((childView) => childView.label === 'GroupLayerView(Shadows)');

    expect(groupView?.alpha).toBe(0.25);
    expect(groupView?.children.some((childView) => childView.label === 'TileLayerView(Shadow tiles)')).toBe(true);

    view.destroy();
  });

  it('moves the world when the viewport origin changes', async () => {
    const map = new TiledMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
    const view = new MapView({
      map,
      autoStartAnimations: false,
      loader: async () => ({ width: 16, height: 16, label: 'fake' }) as never,
    });

    await view.init();
    view.setViewport(-32, -16, 128, 128);

    expect(view.world.position.x).toBe(32);
    expect(view.world.position.y).toBe(16);

    view.destroy();
  });

  it('refreshes layer visibility after map mutations', async () => {
    const map = new TiledMap({ width: 1, height: 1, tileWidth: 16, tileHeight: 16 });
    const layer = new TileLayer('Editable', 0, 0, 1, 1);
    map.addLayer(layer);
    const view = new MapView({
      map,
      autoStartAnimations: false,
      loader: async () => ({ width: 16, height: 16, label: 'fake' }) as never,
    });

    await view.init();
    const layerView = view.world.children.find((childView) => childView.label === 'TileLayerView(Editable)');
    layer.visible = false;
    view.refresh();

    expect(layerView?.visible).toBe(false);

    view.destroy();
  });
});
