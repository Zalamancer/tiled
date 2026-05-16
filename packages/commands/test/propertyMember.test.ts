import { describe, expect, it } from 'vitest';

import { Map as TiledMap, Property } from '@tiled-ts/core';

import { MapDocument, SetPropertyMember, UndoStack } from '../src/index.js';

describe('SetPropertyMember', () => {
  it('sets a nested class member and undoes', () => {
    const map = new TiledMap();
    map.setProperty(
      'stats',
      Property.class('Stat', new Map([['hp', Property.int(10)]])),
    );
    const doc = new MapDocument(map);
    const stack = new UndoStack();

    stack.push(new SetPropertyMember(doc, map, ['stats', 'hp'], Property.int(99)));
    const v = map.property('stats');
    if (v?.kind !== 'class') throw new Error('expected class');
    expect(v.members.get('hp')).toEqual(Property.int(99));

    stack.undo();
    const v2 = map.property('stats');
    if (v2?.kind !== 'class') throw new Error('expected class');
    expect(v2.members.get('hp')).toEqual(Property.int(10));
  });

  it('merges adjacent SetPropertyMember commands on the same path', () => {
    const map = new TiledMap();
    map.setProperty(
      'stats',
      Property.class('Stat', new Map([['hp', Property.int(10)]])),
    );
    const doc = new MapDocument(map);
    const stack = new UndoStack();
    stack.push(new SetPropertyMember(doc, map, ['stats', 'hp'], Property.int(11)));
    stack.push(new SetPropertyMember(doc, map, ['stats', 'hp'], Property.int(12)));
    stack.push(new SetPropertyMember(doc, map, ['stats', 'hp'], Property.int(13)));
    expect(stack.count()).toBe(1);
    stack.undo();
    const v = map.property('stats');
    if (v?.kind !== 'class') throw new Error('expected class');
    expect(v.members.get('hp')).toEqual(Property.int(10));
  });
});
