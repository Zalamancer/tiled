#!/usr/bin/env node
// Entry point for the `tiled-ts` CLI.
//
// Currently exposes a single subcommand:
//
//   tiled-ts rasterize <input.tmj> --out <output.png>
//                       [--scale <float>]
//                       [--bg <#hexcolor>]
//
// The subcommand layout mirrors the upstream Qt `tmxrasterizer` so that scripts
// porting from C++ Tiled can do a near-1:1 flag translation. Additional
// subcommands ( `viewer`, `pack`, …) will be added in later milestones.

import { rasterize, RasterizeNotSupportedError } from './rasterize.js';
import { parseArgs } from './parseArgs.js';

const USAGE = `tiled-ts <subcommand> [options]

Subcommands:
  rasterize <input.tmj>   Render a TMJ map to a PNG image.

Run \`tiled-ts <subcommand> --help\` for per-subcommand flags.`;

const RASTERIZE_USAGE = `tiled-ts rasterize <input.tmj> --out <file.png> [options]

Options:
  -o, --out <file>     Output PNG path (required).
  -s, --scale <n>      Linear render scale (default: 1).
      --bg <#color>    Override the background fill colour.
  -h, --help           Show this help.

Only orthogonal maps with image-based tilesets are supported in this build.`;

async function main(argv: readonly string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(USAGE + '\n');
    return 0;
  }

  const sub = argv[0];
  const rest = argv.slice(1);

  switch (sub) {
    case 'rasterize':
      return runRasterize(rest);
    default:
      process.stderr.write(`unknown subcommand: ${sub}\n\n${USAGE}\n`);
      return 2;
  }
}

async function runRasterize(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    aliases: { out: 'o', scale: 's', help: 'h' },
    booleans: ['help'],
  });

  if (parsed.options.help) {
    process.stdout.write(RASTERIZE_USAGE + '\n');
    return 0;
  }

  const input = parsed.positionals[0];
  const out = stringOpt(parsed.options.out);
  if (!input || !out) {
    process.stderr.write(`error: <input.tmj> and --out are both required\n\n${RASTERIZE_USAGE}\n`);
    return 2;
  }

  const scaleStr = stringOpt(parsed.options.scale);
  const scale = scaleStr === undefined ? 1 : Number(scaleStr);
  if (!Number.isFinite(scale) || scale <= 0) {
    process.stderr.write(`error: invalid --scale "${scaleStr}"\n`);
    return 2;
  }

  const bg = stringOpt(parsed.options.bg);

  try {
    const opts: Parameters<typeof rasterize>[0] = { input, output: out, scale };
    if (bg !== undefined) opts.background = bg;
    const result = await rasterize(opts);
    process.stdout.write(
      `wrote ${out} (${result.width}×${result.height}, ${result.bytesWritten} bytes)\n`,
    );
    return 0;
  } catch (err: unknown) {
    if (err instanceof RasterizeNotSupportedError) {
      process.stderr.write(`error: ${err.message}\n`);
      return 1;
    }
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    return 1;
  }
}

function stringOpt(v: string | boolean | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Detects whether this module is the Node entry script (`node bin.js` /
 * `tiled-ts …`) rather than being imported by tests. We compare
 * `import.meta.url` against the URL form of `process.argv[1]`.
 */
function isEntry(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  // Build the file:// URL the same way Node would for `argv[1]`.
  const path = arg.replace(/\\/g, '/');
  const url = path.startsWith('/') ? `file://${path}` : `file:///${path}`;
  return import.meta.url === url;
}

if (isEntry()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(
        `fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
      );
      process.exit(1);
    },
  );
}

export { rasterize, RasterizeNotSupportedError } from './rasterize.js';
export { parseArgs } from './parseArgs.js';
export { main };
