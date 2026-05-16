// Port of src/tiled/randompicker.h.
//
// Weighted random selection backed by a cumulative-threshold table. Adding a
// value is O(1); picking is O(log n) via binary search. The whole class is
// deterministic when seeded — useful for tests.

export class RandomPicker<T> {
  private thresholds: number[] = [];
  private values: T[] = [];
  private sum = 0;
  /** Override to produce deterministic picks in tests. */
  rng: () => number = Math.random;

  add(value: T, probability = 1): void {
    if (probability <= 0) return;
    this.sum += probability;
    this.thresholds.push(this.sum);
    this.values.push(value);
  }

  isEmpty(): boolean {
    return this.values.length === 0;
  }

  size(): number {
    return this.values.length;
  }

  pick(): T {
    if (this.isEmpty()) throw new Error('RandomPicker is empty');
    if (this.values.length === 1) return this.values[0]!;
    const r = this.rng() * this.sum;
    let lo = 0;
    let hi = this.thresholds.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.thresholds[mid]! < r) lo = mid + 1;
      else hi = mid;
    }
    return this.values[lo]!;
  }

  /** Like `pick`, but also removes the element. */
  take(): T {
    const value = this.pick();
    const i = this.values.indexOf(value);
    if (i >= 0) {
      this.values.splice(i, 1);
      // Rebuild thresholds (rare on the hot path).
      this.thresholds = [];
      this.sum = 0;
      const oldValues = this.values.slice();
      this.values = [];
      for (const v of oldValues) this.add(v, 1);
    }
    return value;
  }

  clear(): void {
    this.thresholds = [];
    this.values = [];
    this.sum = 0;
  }
}
