import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createCanvas } from '@napi-rs/canvas';

import { rasterize } from '../src/rasterize.js';

// A 16×16 PNG tileset with two distinguishable solid-colour tiles (8×8 each).
// Tile ids 0 (red), 1 (green), 2 (blue), 3 (yellow) in a 2×2 grid.
async function writeTilesetImage(path: string): Promise<void> {
  const c = createCanvas(16, 16);
  const ctx = c.getContext('2d');
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = colors[i]!;
    ctx.fillRect((i % 2) * 8, Math.floor(i / 2) * 8, 8, 8);
  }
  await fs.writeFile(path, await c.encode('png'));
}

function tmjForSample(imagePath: string): string {
  return JSON.stringify({
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 3,
    height: 3,
    tilewidth: 8,
    tileheight: 8,
    infinite: false,
    nextlayerid: 2,
    nextobjectid: 1,
    compressionlevel: -1,
    tilesets: [
      {
        firstgid: 1,
        name: 'pixels',
        tilewidth: 8,
        tileheight: 8,
        spacing: 0,
        margin: 0,
        tilecount: 4,
        columns: 2,
        image: imagePath,
        imagewidth: 16,
        imageheight: 16,
      },
    ],
    layers: [
      {
        id: 1,
        type: 'tilelayer',
        name: 'main',
        width: 3,
        height: 3,
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        encoding: 'csv',
        // Row-major: nine cells, all referencing the four tiles in rotation.
        data: [1, 2, 3, 4, 1, 2, 3, 4, 1],
      },
    ],
  });
}

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'tiled-ts-cli-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('rasterize', () => {
  it('writes a non-empty PNG for a 3×3 CSV-layer map', async () => {
    const imgPath = join(workDir, 'tiles.png');
    await writeTilesetImage(imgPath);

    const tmjPath = join(workDir, 'map.tmj');
    await fs.writeFile(tmjPath, tmjForSample('tiles.png'));

    const outPath = join(workDir, 'out.png');
    const result = await rasterize({ input: tmjPath, output: outPath, scale: 1 });

    expect(result.width).toBe(24); // 3 tiles × 8 px wide
    expect(result.height).toBe(24);
    expect(result.bytesWritten).toBeGreaterThan(0);

    const png = await fs.readFile(outPath);
    expect(png.byteLength).toBeGreaterThan(0);
    // PNG signature is 89 50 4E 47 0D 0A 1A 0A. Convert the Buffer slice to a
    // plain Uint8Array so vitest's `toEqual` doesn't compare against Buffer
    // metadata.
    expect(Uint8Array.from(png.subarray(0, 8))).toEqual(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('applies --scale to the output dimensions', async () => {
    const imgPath = join(workDir, 'tiles.png');
    await writeTilesetImage(imgPath);

    const tmjPath = join(workDir, 'map.tmj');
    await fs.writeFile(tmjPath, tmjForSample('tiles.png'));

    const outPath = join(workDir, 'out2x.png');
    const result = await rasterize({ input: tmjPath, output: outPath, scale: 2 });
    expect(result.width).toBe(48);
    expect(result.height).toBe(48);
  });

  it('rejects a missing input file with a sensible error', async () => {
    const outPath = join(workDir, 'out.png');
    await expect(
      rasterize({ input: join(workDir, 'does-not-exist.tmj'), output: outPath }),
    ).rejects.toThrow();
  });
});
