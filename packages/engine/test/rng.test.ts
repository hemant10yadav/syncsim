import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';

const draws = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('replays the same sequence for the same seed', () => {
    expect(draws(42, 20)).toEqual(draws(42, 20));
  });

  it('produces a different sequence for a different seed', () => {
    expect(draws(42, 20)).not.toEqual(draws(43, 20));
  });

  it('keeps next() in [0, 1) and int() within its inclusive bounds', () => {
    const rng = createRng(7);
    const ints = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      ints.add(rng.int(3, 6));
    }
    expect([...ints].sort()).toEqual([3, 4, 5, 6]);
  });

  it('treats chance(0) as never and chance(1) as always', () => {
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});
