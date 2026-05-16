// Tiny dependency-free argv parser. Supports:
//   --flag             → boolean true
//   --opt value        → string
//   --opt=value        → string
//   -x                 → short alias (mapped via `aliases`)
// Anything else accumulates into `positionals`.

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export interface ParseSpec {
  /** Long-name → short single-char alias. */
  aliases?: Record<string, string>;
  /** Flags that never take a value (always boolean). */
  booleans?: readonly string[];
}

export function parseArgs(argv: readonly string[], spec: ParseSpec = {}): ParsedArgs {
  const booleans = new Set(spec.booleans ?? []);
  const shortToLong: Record<string, string> = {};
  if (spec.aliases) {
    for (const [long, short] of Object.entries(spec.aliases)) shortToLong[short] = long;
  }

  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;

    // `--name=value` or `--name value` or boolean `--name`.
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const inlineValue = eq === -1 ? undefined : tok.slice(eq + 1);
      if (booleans.has(name)) {
        options[name] = inlineValue === undefined ? true : inlineValue !== 'false';
        continue;
      }
      if (inlineValue !== undefined) {
        options[name] = inlineValue;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        // No value: treat as boolean flag.
        options[name] = true;
      } else {
        options[name] = next;
        i += 1;
      }
      continue;
    }

    // Short option like `-s 2`.
    if (tok.startsWith('-') && tok.length === 2) {
      const short = tok.slice(1);
      const long = shortToLong[short];
      if (!long) {
        positionals.push(tok);
        continue;
      }
      if (booleans.has(long)) {
        options[long] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        options[long] = true;
      } else {
        options[long] = next;
        i += 1;
      }
      continue;
    }

    positionals.push(tok);
  }

  return { positionals, options };
}
