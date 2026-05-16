// Tiny hand-written parser for the Lua-table subset the Lua writer emits.
//
// We do *not* implement the full Lua grammar. The writer's output is a
// `return <table>` document where:
//   • keys are either plain identifiers (`width = 32`) or quoted strings
//     (`["my key"] = "value"`);
//   • values are numbers, booleans, strings, nil, or nested tables;
//   • tables may be array-like (positional values) or record-like (keyed),
//     and may mix both.
//
// That's the subset Tiled's Lua plugin reads back via `dofile`. The parser
// is iterative and tolerates whitespace / comments / trailing commas.

export type LuaValue =
  | string
  | number
  | boolean
  | null
  | LuaTable;

export type LuaTable = {
  /** Insertion-ordered map of named entries. */
  map: Map<string, LuaValue>;
  /** 1-indexed positional entries (Lua-style — preserves write order). */
  array: LuaValue[];
};

export function parseLuaReturn(input: string): LuaValue {
  const p = new LuaParser(input);
  p.skipWhitespace();
  p.expectKeyword('return');
  p.skipWhitespace();
  const v = p.parseValue();
  p.skipWhitespace();
  return v;
}

export function parseLuaValue(input: string): LuaValue {
  const p = new LuaParser(input);
  p.skipWhitespace();
  const v = p.parseValue();
  p.skipWhitespace();
  return v;
}

/** Convenience: read `t.map.get(key)` casting to a `LuaTable`. */
export function asTable(v: LuaValue | undefined): LuaTable | undefined {
  if (v && typeof v === 'object' && 'map' in v && 'array' in v) return v;
  return undefined;
}

class LuaParser {
  private pos = 0;

  constructor(private input: string) {}

  parseValue(): LuaValue {
    this.skipWhitespace();
    const c = this.peek();
    if (c === undefined) throw this.err('unexpected end of input');
    if (c === '{') return this.parseTable();
    if (c === '"' || c === "'") return this.parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return this.parseNumber();
    if (this.match('true')) return true;
    if (this.match('false')) return false;
    if (this.match('nil')) return null;
    throw this.err(`unexpected character: ${JSON.stringify(c)}`);
  }

  private parseTable(): LuaTable {
    this.expect('{');
    const table: LuaTable = { map: new Map(), array: [] };
    this.skipWhitespace();
    if (this.peek() === '}') {
      this.advance();
      return table;
    }
    while (true) {
      this.skipWhitespace();
      const key = this.tryParseKey();
      if (key !== undefined) {
        const value = this.parseValue();
        table.map.set(key, value);
      } else {
        const value = this.parseValue();
        table.array.push(value);
      }
      this.skipWhitespace();
      const sep = this.peek();
      if (sep === ',' || sep === ';') {
        this.advance();
        this.skipWhitespace();
        if (this.peek() === '}') {
          this.advance();
          return table;
        }
        continue;
      }
      if (sep === '}') {
        this.advance();
        return table;
      }
      throw this.err(`expected ',' or '}', got ${JSON.stringify(sep)}`);
    }
  }

  /** Tries `<ident> = ` or `["<str>"] = `. Returns key on success, restoring
   *  the cursor on failure. */
  private tryParseKey(): string | undefined {
    const start = this.pos;
    if (this.peek() === '[') {
      this.advance();
      this.skipWhitespace();
      const key = this.parseString();
      this.skipWhitespace();
      if (this.peek() !== ']') {
        this.pos = start;
        return undefined;
      }
      this.advance();
      this.skipWhitespace();
      if (this.peek() !== '=') {
        this.pos = start;
        return undefined;
      }
      this.advance();
      return key;
    }

    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.input.slice(this.pos));
    if (!m) return undefined;
    const ident = m[0];
    const after = this.pos + ident.length;
    let j = after;
    while (j < this.input.length && /\s/.test(this.input[j]!)) j += 1;
    if (this.input[j] !== '=' || this.input[j + 1] === '=') return undefined;
    this.pos = j + 1;
    return ident;
  }

  private parseString(): string {
    const q = this.peek();
    if (q !== '"' && q !== "'") throw this.err('expected string');
    this.advance();
    let out = '';
    while (this.pos < this.input.length) {
      const c = this.input[this.pos]!;
      if (c === q) {
        this.advance();
        return out;
      }
      if (c === '\\') {
        const next = this.input[this.pos + 1];
        if (next === 'n') out += '\n';
        else if (next === 'r') out += '\r';
        else if (next === 't') out += '\t';
        else if (next === '\\') out += '\\';
        else if (next === '"') out += '"';
        else if (next === "'") out += "'";
        else out += next ?? '';
        this.pos += 2;
        continue;
      }
      out += c;
      this.pos += 1;
    }
    throw this.err('unterminated string');
  }

  private parseNumber(): number {
    // Accept decimal, optional sign and exponent. Hex / Lua-specific literals
    // are not used by the writer so we keep this simple.
    const m = /^[+-]?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][+-]?\d+)?/.exec(
      this.input.slice(this.pos),
    );
    if (!m) throw this.err('expected number');
    this.pos += m[0].length;
    return Number(m[0]);
  }

  /* ───────── lexing helpers ───────── */

  peek(): string | undefined {
    return this.input[this.pos];
  }

  private advance(): void {
    this.pos += 1;
  }

  expect(c: string): void {
    if (this.input[this.pos] !== c) throw this.err(`expected ${JSON.stringify(c)}`);
    this.pos += 1;
  }

  expectKeyword(kw: string): void {
    if (!this.match(kw)) throw this.err(`expected keyword ${JSON.stringify(kw)}`);
  }

  match(kw: string): boolean {
    if (this.input.startsWith(kw, this.pos)) {
      const next = this.input[this.pos + kw.length];
      if (next === undefined || !/[A-Za-z0-9_]/.test(next)) {
        this.pos += kw.length;
        return true;
      }
    }
    return false;
  }

  skipWhitespace(): void {
    while (this.pos < this.input.length) {
      const c = this.input[this.pos]!;
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.pos += 1;
        continue;
      }
      // Single-line comment `-- …`.
      if (c === '-' && this.input[this.pos + 1] === '-') {
        // Block comment `--[[ … ]]` (no nesting / no levels).
        if (this.input[this.pos + 2] === '[' && this.input[this.pos + 3] === '[') {
          const end = this.input.indexOf(']]', this.pos + 4);
          this.pos = end < 0 ? this.input.length : end + 2;
          continue;
        }
        const nl = this.input.indexOf('\n', this.pos + 2);
        this.pos = nl < 0 ? this.input.length : nl + 1;
        continue;
      }
      break;
    }
  }

  private err(msg: string): Error {
    const ctx = this.input.slice(Math.max(0, this.pos - 20), this.pos + 20);
    return new Error(`Lua parse error at ${this.pos}: ${msg} (near ${JSON.stringify(ctx)})`);
  }
}
