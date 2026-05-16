import { describe, expect, it } from 'vitest';

import { parseArgs } from '../src/parseArgs.js';

describe('parseArgs', () => {
  it('captures positional arguments', () => {
    const parsed = parseArgs(['foo.tmj', 'bar.png']);
    expect(parsed.positionals).toEqual(['foo.tmj', 'bar.png']);
    expect(parsed.options).toEqual({});
  });

  it('parses --opt value, --opt=value, and short aliases', () => {
    const parsed = parseArgs(
      ['--scale', '2', '--out=foo.png', '-o', 'bar.png', 'pos'],
      { aliases: { out: 'o' } },
    );
    expect(parsed.options.scale).toBe('2');
    // Later `-o bar.png` overrides earlier `--out=foo.png`.
    expect(parsed.options.out).toBe('bar.png');
    expect(parsed.positionals).toEqual(['pos']);
  });

  it('treats boolean flags as true even without a value', () => {
    const parsed = parseArgs(['--help', 'subject'], { booleans: ['help'] });
    expect(parsed.options.help).toBe(true);
    expect(parsed.positionals).toEqual(['subject']);
  });

  it('uses the next arg as a value only when not a flag', () => {
    const parsed = parseArgs(['--scale', '--bg', '#fff']);
    // `--scale` got no value (next is `--bg`) so it becomes a boolean.
    expect(parsed.options.scale).toBe(true);
    expect(parsed.options.bg).toBe('#fff');
  });
});
