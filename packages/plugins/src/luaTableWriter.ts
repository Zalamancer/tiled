// Port of src/plugins/lua/luatablewriter.h+cpp.
//
// A small streaming helper for emitting Lua table literals. The original C++
// version writes to a `QIODevice`; we accumulate into a `string[]` and join
// at the end. The format choices (two-space indent, `key = value` spacing)
// are preserved verbatim so output is diff-compatible with the C++ writer.

export class LuaTableWriter {
  private parts: string[] = [];
  private indent = 0;
  private newLine = true;
  private valueWritten = false;
  private suppressNewlines = false;
  private minimize = false;

  setMinimize(v: boolean): void {
    this.minimize = v;
  }

  setSuppressNewlines(v: boolean): void {
    this.suppressNewlines = v;
  }

  result(): string {
    return this.parts.join('');
  }

  writeStartDocument(): void {
    // No-op — matches upstream behaviour.
  }

  writeEndDocument(): void {
    this.parts.push('\n');
  }

  writeStartReturnTable(): void {
    this.prepareNewLine();
    this.parts.push(this.minimize ? 'return{' : 'return {');
    this.indent += 1;
    this.newLine = false;
    this.valueWritten = false;
  }

  writeStartTable(name?: string): void {
    this.prepareNewLine();
    if (name === undefined) {
      this.parts.push('{');
    } else if (isPlainKey(name)) {
      this.parts.push(name);
      this.parts.push(this.minimize ? '={' : ' = {');
    } else {
      this.parts.push('[');
      this.parts.push(quote(name));
      this.parts.push(this.minimize ? ']={' : '] = {');
    }
    this.indent += 1;
    this.newLine = false;
    this.valueWritten = false;
  }

  writeEndTable(): void {
    if (this.indent <= 0) throw new Error('LuaTableWriter: unbalanced writeEndTable');
    this.indent -= 1;
    if (this.valueWritten) this.writeNewline();
    this.parts.push('}');
    this.newLine = false;
    this.valueWritten = true;
  }

  /** Write `key = value` where `value` is a primitive. Strings are auto-quoted. */
  writeKeyAndValue(key: string, value: string | number | boolean | null | undefined): void {
    this.prepareNewLine();
    this.parts.push(key);
    if (typeof value === 'string') {
      this.parts.push(this.minimize ? '=' : ' = ');
      this.parts.push(quote(value));
    } else {
      this.parts.push(this.minimize ? '=' : ' = ');
      this.parts.push(formatPrimitive(value));
    }
    this.newLine = false;
    this.valueWritten = true;
  }

  writeKeyAndUnquotedValue(key: string, value: string | number | boolean): void {
    this.prepareNewLine();
    this.parts.push(key);
    this.parts.push(this.minimize ? '=' : ' = ');
    this.parts.push(String(value));
    this.newLine = false;
    this.valueWritten = true;
  }

  /** Write a bracketed string key (`["..."] = value`). */
  writeQuotedKeyAndValue(key: string, value: string | number | boolean | null | undefined): void {
    this.prepareNewLine();
    this.parts.push('[');
    this.parts.push(quote(key));
    this.parts.push(this.minimize ? ']=' : '] = ');
    if (typeof value === 'string') this.parts.push(quote(value));
    else this.parts.push(formatPrimitive(value));
    this.newLine = false;
    this.valueWritten = true;
  }

  writeValue(value: string | number | boolean): void {
    this.prepareNewValue();
    if (typeof value === 'string') this.parts.push(quote(value));
    else this.parts.push(formatPrimitive(value));
    this.newLine = false;
    this.valueWritten = true;
  }

  writeUnquotedValue(raw: string): void {
    this.prepareNewValue();
    this.parts.push(raw);
    this.newLine = false;
    this.valueWritten = true;
  }

  /** Emits a newline if the writer is currently in an "after-value" state. */
  prepareNewLine(): void {
    if (this.valueWritten) {
      this.parts.push(',');
      this.valueWritten = false;
    }
    this.writeNewline();
  }

  private prepareNewValue(): void {
    if (!this.valueWritten) {
      this.writeNewline();
    } else {
      this.parts.push(',');
      if (!this.minimize) this.parts.push(' ');
    }
  }

  private writeNewline(): void {
    if (this.newLine) return;
    if (!this.minimize) {
      if (this.suppressNewlines) {
        this.parts.push(' ');
      } else {
        this.parts.push('\n');
        for (let i = 0; i < this.indent; i++) this.parts.push('  ');
      }
    }
    this.newLine = true;
  }
}

function formatPrimitive(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    // Match Qt's behaviour for doubles: integers print without `.0`.
    if (!Number.isFinite(v)) return v === Infinity ? '1/0' : (v === -Infinity ? '-1/0' : '0/0');
    return String(v);
  }
  return quote(v);
}

function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x5c) out += '\\\\';
    else if (c === 0x22) out += '\\"';
    else if (c === 0x0a) out += '\\n';
    else out += s[i];
  }
  out += '"';
  return out;
}

function isPlainKey(s: string): boolean {
  // Lua identifier rule: ^[A-Za-z_][A-Za-z0-9_]*$. We use bracketed-string
  // keys for anything else.
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}
