// Port of libtiled/hex.h+cpp.
//
// Cube coordinates for hexagonal staggered maps. The conversion to/from a
// 2-D staggered grid depends on the map's stagger-index and stagger-axis.

import type { Point } from './types.js';
import { RotateDirection } from './tiled.js';

export enum StaggerAxis {
  StaggerX = 0,
  StaggerY = 1,
}
export enum StaggerIndex {
  StaggerOdd = 0,
  StaggerEven = 1,
}

export class Hex {
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static fromStaggered(col: number, row: number, staggerIndex: StaggerIndex, staggerAxis: StaggerAxis): Hex {
    const h = new Hex();
    h.setStaggered(col, row, staggerIndex, staggerAxis);
    return h;
  }

  setStaggered(col: number, row: number, staggerIndex: StaggerIndex, staggerAxis: StaggerAxis): void {
    if (staggerAxis === StaggerAxis.StaggerX) {
      if (staggerIndex === StaggerIndex.StaggerEven) {
        this.x = col;
        this.z = row - ((col + (col & 1)) >> 1);
        this.y = -this.x - this.z;
      } else {
        this.x = col;
        this.z = row - ((col - (col & 1)) >> 1);
        this.y = -this.x - this.z;
      }
    } else {
      if (staggerIndex === StaggerIndex.StaggerEven) {
        this.x = col - ((row + (row & 1)) >> 1);
        this.z = row;
        this.y = -this.x - this.z;
      } else {
        this.x = col - ((row - (row & 1)) >> 1);
        this.z = row;
        this.y = -this.x - this.z;
      }
    }
  }

  toStaggered(staggerIndex: StaggerIndex, staggerAxis: StaggerAxis): Point {
    if (staggerAxis === StaggerAxis.StaggerX) {
      const adj = staggerIndex === StaggerIndex.StaggerEven ? this.x + (this.x & 1) : this.x - (this.x & 1);
      return { x: this.x, y: this.z + (adj >> 1) };
    }
    const adj = staggerIndex === StaggerIndex.StaggerEven ? this.z + (this.z & 1) : this.z - (this.z & 1);
    return { x: this.x + (adj >> 1), y: this.z };
  }

  rotate(direction: RotateDirection): void {
    const tX = this.x;
    if (direction === RotateDirection.RotateLeft) {
      this.x = -this.y;
      this.y = -this.z;
      this.z = -tX;
    } else {
      this.x = -this.z;
      this.z = -this.y;
      this.y = -tX;
    }
  }

  add(h: Hex): Hex {
    return new Hex(this.x + h.x, this.y + h.y, this.z + h.z);
  }
  sub(h: Hex): Hex {
    return new Hex(this.x - h.x, this.y - h.y, this.z - h.z);
  }
  addEq(h: Hex): this {
    this.x += h.x;
    this.y += h.y;
    this.z += h.z;
    return this;
  }
  subEq(h: Hex): this {
    this.x -= h.x;
    this.y -= h.y;
    this.z -= h.z;
    return this;
  }
}
