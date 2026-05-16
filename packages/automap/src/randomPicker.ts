// Local copy of `RandomPicker` from src/tiled/randompicker.h, so the automap
// package does not have to depend on `@tiled-ts/tools` just for one helper.
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

  clear(): void {
    this.thresholds = [];
    this.values = [];
    this.sum = 0;
  }
}
