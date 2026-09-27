import { describe, expect, it } from 'vitest';
import type { RegisterStrategy } from '../src/registers';
import { Replica, type ReplicaOptions } from '../src/replica';
import { pull, syncPair } from '../src/sync';

const HOUR = 3_600_000;

function world(options: ReplicaOptions = {}) {
  let t = 1_000;
  return {
    advance: (ms: number) => (t += ms),
    device: (id: string, skew = 0) => new Replica(id, () => t + skew, options),
  };
}

describe('register strategies on real histories', () => {
  /** A fast-clocked device writes; an honest device sees it, then changes it. */
  function clockLiar(registers: RegisterStrategy) {
    const w = world({ registers });
    const fast = w.device('fast', HOUR);
    const honest = w.device('honest');
    fast.set('case-1', 'status', 'open');
    pull(honest, fast);
    w.advance(1_000);
    honest.set('case-1', 'status', 'closed');
    syncPair(fast, honest);
    return { fast, honest };
  }

  it('lww-wall lets a stale write beat a newer one when the stale device’s clock is fast', () => {
    const { fast, honest } = clockLiar('lww-wall');
    expect(fast.value('case-1', 'status')).toBe('open');
    expect(honest.value('case-1', 'status')).toBe('open');
  });

  it('lww-hlc and multi-value keep the newer write in the same history', () => {
    for (const registers of ['lww-hlc', 'multi-value'] as const) {
      const { fast, honest } = clockLiar(registers);
      expect(fast.value('case-1', 'status')).toBe('closed');
      expect(honest.conflicts()).toEqual([]);
    }
  });

  /** Two devices change the same field without having seen each other's change. */
  function concurrentEdits(registers: RegisterStrategy) {
    const w = world({ registers });
    const a = w.device('a', HOUR);
    const b = w.device('b');
    a.set('case-1', 'status', 'open');
    b.set('case-1', 'status', 'closed');
    syncPair(a, b);
    return { a, b };
  }

  it('last-write-wins strategies silently drop one of two concurrent writes', () => {
    for (const registers of ['lww-wall', 'lww-hlc'] as const) {
      const { a, b } = concurrentEdits(registers);
      expect(a.value('case-1', 'status')).toBe('open');
      expect(b.conflicts()).toEqual([]);
    }
  });

  it('multi-value surfaces concurrent writes as a conflict on every device', () => {
    const { a, b } = concurrentEdits('multi-value');
    for (const device of [a, b]) {
      const [conflict] = device.conflicts();
      expect(conflict?.field).toBe('status');
      expect(conflict?.candidates.map((op) => op.change.value)).toEqual(['open', 'closed']);
    }
  });

  it('multi-value clears the conflict once someone writes a resolution', () => {
    const { a, b } = concurrentEdits('multi-value');
    b.set('case-1', 'status', 'closed');
    syncPair(a, b);
    expect(a.conflicts()).toEqual([]);
    expect(a.value('case-1', 'status')).toBe('closed');
  });

  it('re-reads the same history when the strategy changes', () => {
    const { a } = concurrentEdits('lww-hlc');
    expect(a.conflicts()).toEqual([]);
    a.setRegisterStrategy('multi-value');
    expect(a.conflicts()).toHaveLength(1);
    a.setRegisterStrategy('lww-hlc');
    expect(a.conflicts()).toEqual([]);
  });
});
