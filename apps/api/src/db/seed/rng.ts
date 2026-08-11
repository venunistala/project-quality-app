/**
 * mulberry32 - a small, well-known deterministic PRNG. Used instead of a
 * library dependency because the seed script only needs a bounded number of
 * reproducible draws (shuffles, weighted picks, jitter), not a
 * cryptographically strong or statistically rigorous generator.
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** A float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** An integer in [min, max], inclusive on both ends. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Rng.pick: cannot pick from an empty array');
    }
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) {
      throw new Error('Rng.pick: index out of bounds (unreachable)');
    }
    return item;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = copy[i];
      const b = copy[j];
      if (a === undefined || b === undefined) {
        throw new Error('Rng.shuffle: index out of bounds (unreachable)');
      }
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  }

  /** A deterministic UUID-v4-shaped string, seeded by this Rng. */
  uuid(): string {
    const bytes = Array.from({ length: 16 }, () => this.int(0, 255));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
