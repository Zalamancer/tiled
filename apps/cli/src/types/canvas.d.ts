// Local ambient shim for `@napi-rs/canvas`.
//
// Kept in-tree so `tsc --noEmit` works before `pnpm install` has run. The real
// `@napi-rs/canvas` types — once installed — will be a structural superset of
// this, so calls in `rasterize.ts` continue to type-check.

declare module '@napi-rs/canvas' {
  export interface Image {
    readonly width: number;
    readonly height: number;
    src?: Buffer | Uint8Array | string;
  }

  /** Thin subset of the `@napi-rs/canvas` 2D context surface used by the CLI. */
  export interface SKRSContext2D {
    imageSmoothingEnabled: boolean;
    fillStyle: string | CanvasGradient | CanvasPattern;
    globalAlpha: number;

    save(): void;
    restore(): void;
    scale(x: number, y: number): void;
    translate(x: number, y: number): void;
    rotate(angle: number): void;

    fillRect(x: number, y: number, w: number, h: number): void;

    drawImage(
      image: Image,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void;
  }

  export interface Canvas {
    readonly width: number;
    readonly height: number;
    getContext(kind: '2d'): SKRSContext2D;
    encode(format: 'png' | 'jpeg' | 'webp'): Promise<Buffer>;
    encodeSync(format: 'png' | 'jpeg' | 'webp'): Buffer;
  }

  // Minimal value-typed exports — real package will replace these signatures.
  export function createCanvas(width: number, height: number): Canvas;
  export function loadImage(
    src: string | Buffer | Uint8Array | URL,
  ): Promise<Image>;
}
