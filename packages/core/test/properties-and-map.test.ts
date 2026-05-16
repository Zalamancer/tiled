import { describe, expect, it } from 'vitest';

import {
  Property,
  Properties,
  cloneProperties,
  mergeProperties,
  propertyValuesEqual,
  Map as TiledMap,
  TileLayer,
  ObjectGroup,
  GroupLayer,
  LayerTypeFlag,
  MapOrientation,
  StaggerAxis,
  StaggerIndex,
  Hex,
} from '../src/index.js';

describe('Properties helpers', () => {
  it('clone produces a deep copy', () => {
    const src: Properties = new Map();
    src.set(
      'health',
      Property.class('Stat', new Map([['amount', Property.int(7)]])),
    );
    const dst = cloneProperties(src);
    const cls = dst.get('health');
    if (cls?.kind !== 'class') throw new Error('expected class value');
    expect(cls.members.get('amount')).toEqual(Property.int(7));
    // Mutation of src does not leak to dst.
    cls.members.set('amount', Property.int(99));
    const original = src.get('health');
    if (original?.kind !== 'class') throw new Error('expected class value');
    expect(original.members.get('amount')).toEqual(Property.int(7));
  });

  it('mergeProperties is destructive on target', () => {
    const a: Properties = new Map([['x', Property.int(1)]]);
    const b: Properties = new Map([
      ['x', Property.int(2)],
      ['y', Property.string('hi')],
    ]);
    mergeProperties(a, b);
    expect(a.get('x')).toEqual(Property.int(2));
    expect(a.get('y')).toEqual(Property.string('hi'));
  });

  it('propertyValuesEqual handles every kind', () => {
    expect(propertyValuesEqual(Property.string('a'), Property.string('a'))).toBe(true);
    expect(propertyValuesEqual(Property.int(1), Property.float(1))).toBe(false);
    expect(propertyValuesEqual(Property.color('#fff'), Property.color('#fff'))).toBe(true);
    expect(
      propertyValuesEqual(
        Property.class('A', new Map([['k', Property.int(1)]])),
        Property.class('A', new Map([['k', Property.int(1)]])),
      ),
    ).toBe(true);
    expect(
      propertyValuesEqual(
        Property.class('A', new Map([['k', Property.int(1)]])),
        Property.class('A', new Map([['k', Property.int(2)]])),
      ),
    ).toBe(false);
  });
});

describe('Map structure', () => {
  it('addLayer assigns map and parent', () => {
    const map = new TiledMap({ width: 10, height: 10, tileWidth: 16, tileHeight: 16 });
    const tl = new TileLayer('main', 0, 0, 10, 10);
    map.addLayer(tl);
    expect(tl.map).toBe(map);
    expect(tl.parentLayer).toBeUndefined();
    expect(map.layerAt(0)).toBe(tl);
  });

  it('GroupLayer adoption pushes the map down to children', () => {
    const map = new TiledMap();
    const grp = new GroupLayer('group', 0, 0);
    const child = new TileLayer('child', 0, 0, 4, 4);
    grp.addLayer(child);
    map.addLayer(grp);
    expect(child.map).toBe(map);
    expect(child.parentLayer).toBe(grp);
    expect(grp.parentLayer).toBeUndefined();
  });

  it('layerCount filters by type-flag', () => {
    const map = new TiledMap();
    map.addLayer(new TileLayer('t', 0, 0, 1, 1));
    map.addLayer(new ObjectGroup('o'));
    map.addLayer(new TileLayer('t2', 0, 0, 1, 1));
    expect(map.layerCount()).toBe(3);
    expect(map.layerCount(LayerTypeFlag.TileLayerType)).toBe(2);
    expect(map.layerCount(LayerTypeFlag.ObjectGroupType)).toBe(1);
  });

  it('takeNextObjectId increments', () => {
    const map = new TiledMap();
    expect(map.takeNextObjectId()).toBe(1);
    expect(map.takeNextObjectId()).toBe(2);
    expect(map.takeNextObjectId()).toBe(3);
  });
});

describe('Hex coordinates', () => {
  it('round-trips through staggered conversion (StaggerY/odd)', () => {
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        const h = Hex.fromStaggered(col, row, StaggerIndex.StaggerOdd, StaggerAxis.StaggerY);
        const p = h.toStaggered(StaggerIndex.StaggerOdd, StaggerAxis.StaggerY);
        expect(p).toEqual({ x: col, y: row });
      }
    }
  });
  it('cube invariant holds: x + y + z === 0', () => {
    const h = Hex.fromStaggered(2, 5, StaggerIndex.StaggerEven, StaggerAxis.StaggerX);
    expect(h.x + h.y + h.z).toBe(0);
  });
});

describe('MapOrientation enum', () => {
  it('has Orthogonal as default', () => {
    const m = new TiledMap();
    expect(m.orientation).toBe(MapOrientation.Orthogonal);
  });
});
