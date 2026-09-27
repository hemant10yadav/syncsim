import { describe, expect, it } from 'vitest';
import { compareTimestamps, HybridClock } from '../src/hlc';

function manualClock(start: number) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v) };
}

describe('HybridClock', () => {
  it('follows physical time when it moves forward', () => {
    const phys = manualClock(100);
    const clock = new HybridClock('a', phys.now);
    expect(clock.now()).toEqual({ wall: 100, counter: 0, node: 'a' });
    phys.set(250);
    expect(clock.now()).toEqual({ wall: 250, counter: 0, node: 'a' });
  });

  it('never goes backwards when the physical clock stalls or rewinds', () => {
    const phys = manualClock(500);
    const clock = new HybridClock('a', phys.now);
    const first = clock.now();
    const stalled = clock.now();
    phys.set(10);
    const rewound = clock.now();
    expect(compareTimestamps(stalled, first)).toBeGreaterThan(0);
    expect(compareTimestamps(rewound, stalled)).toBeGreaterThan(0);
    expect(rewound).toEqual({ wall: 500, counter: 2, node: 'a' });
  });

  it('issues timestamps after anything it has received, even from a clock far ahead', () => {
    const clock = new HybridClock('b', () => 1_000);
    const fromTheFuture = { wall: 9_000, counter: 4, node: 'a' };
    clock.receive(fromTheFuture);
    const next = clock.now();
    expect(compareTimestamps(next, fromTheFuture)).toBeGreaterThan(0);
    expect(next.wall).toBe(9_000);
  });

  it('bumps the counter past both sides when wall values tie', () => {
    const clock = new HybridClock('b', () => 0);
    clock.receive({ wall: 50, counter: 0, node: 'a' });
    clock.receive({ wall: 50, counter: 7, node: 'c' });
    expect(clock.now()).toEqual({ wall: 50, counter: 9, node: 'b' });
  });

  it('breaks exact ties by node id so the order is total', () => {
    const a = { wall: 1, counter: 1, node: 'a' };
    const b = { wall: 1, counter: 1, node: 'b' };
    expect(compareTimestamps(a, b)).toBeLessThan(0);
    expect(compareTimestamps(b, a)).toBeGreaterThan(0);
    expect(compareTimestamps(a, { ...a })).toBe(0);
  });
});
