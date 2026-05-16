import { describe, expect, it } from 'vitest';

import {
  Property,
  getPropertyMemberValue,
  pathToString,
  setPropertyMemberValue,
  toPropertyPath,
  type Properties,
} from '../src/index.js';

describe('property path utilities', () => {
  it('toPropertyPath converts mixed string/integer segments', () => {
    expect(toPropertyPath(['a', '0', 'b'])).toEqual(['a', 0, 'b']);
  });

  it('pathToString round-trips for simple paths', () => {
    expect(pathToString(['a', 'b', 'c'])).toBe('a.b.c');
    expect(pathToString(['a', 0, 'b'])).toBe('a[0].b');
  });

  it('setPropertyMemberValue replaces a top-level entry', () => {
    const p: Properties = new Map();
    expect(setPropertyMemberValue(p, ['name'], Property.string('foo'))).toBe(true);
    expect(p.get('name')).toEqual(Property.string('foo'));
  });

  it('setPropertyMemberValue walks into nested class values without mutating original', () => {
    const inner: Properties = new Map([['amount', Property.int(7)]]);
    const root: Properties = new Map([['stats', Property.class('Stat', inner)]]);
    const snapshot = JSON.parse(JSON.stringify(
      [...root.entries()].map(([k, v]) => [k, (v as { members?: Properties }).members ? [...((v as { members: Properties }).members)] : v]),
    ));
    const ok = setPropertyMemberValue(root, ['stats', 'amount'], Property.int(99));
    expect(ok).toBe(true);
    expect(inner.get('amount')).toEqual(Property.int(7)); // unchanged
    const stats = root.get('stats');
    if (stats?.kind !== 'class') throw new Error('expected class');
    expect(stats.members.get('amount')).toEqual(Property.int(99));
    void snapshot;
  });

  it('getPropertyMemberValue retrieves the nested value', () => {
    const inner: Properties = new Map([['x', Property.int(3)]]);
    const root: Properties = new Map([['point', Property.class('Point', inner)]]);
    expect(getPropertyMemberValue(root, ['point', 'x'])).toEqual(Property.int(3));
    expect(getPropertyMemberValue(root, ['point', 'y'])).toBeUndefined();
  });

  it('returns false when the path references a non-class intermediate', () => {
    const p: Properties = new Map([['name', Property.string('foo')]]);
    expect(setPropertyMemberValue(p, ['name', 'sub'], Property.string('x'))).toBe(false);
  });
});
