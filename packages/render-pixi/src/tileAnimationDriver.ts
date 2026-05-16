// Port of libtiled/tileanimationdriver.h+cpp.
//
// Tracks elapsed time and advances tile animations by delta-ms each frame.
// Hook into PIXI's `Ticker` via `start()` / `stop()`.

import { Ticker } from 'pixi.js';
import type { Tileset } from '@tiled-ts/core';

export interface AnimationListener {
  /** Called when at least one animated tile has a new `currentFrameTile`. */
  onTilesAdvanced(): void;
}

export class TileAnimationDriver {
  private listeners = new Set<AnimationListener>();
  private tilesets = new Set<Tileset>();
  private ticker = new Ticker();
  private boundTick = (t: Ticker) => this.tick(t.deltaMS);
  private running = false;

  constructor() {
    this.ticker.maxFPS = 60;
    this.ticker.autoStart = false;
  }

  addListener(l: AnimationListener): void {
    this.listeners.add(l);
  }
  removeListener(l: AnimationListener): void {
    this.listeners.delete(l);
  }

  /** Track a tileset so all of its animated tiles tick together. */
  trackTileset(ts: Tileset): void {
    this.tilesets.add(ts);
  }
  untrackTileset(ts: Tileset): void {
    this.tilesets.delete(ts);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.ticker.add(this.boundTick);
    this.ticker.start();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ticker.remove(this.boundTick);
    this.ticker.stop();
  }

  /** Manual time step (mostly for tests; the ticker calls this in real use). */
  tick(deltaMS: number): boolean {
    let changed = false;
    for (const ts of this.tilesets) {
      for (const tile of ts.tiles) {
        if (tile.isAnimated() && tile.advanceAnimation(deltaMS)) changed = true;
      }
    }
    if (changed) for (const l of this.listeners) l.onTilesAdvanced();
    return changed;
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.tilesets.clear();
    this.ticker.destroy();
  }
}
