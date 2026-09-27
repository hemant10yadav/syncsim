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

describe('counters', () => {
  function offlineVisits(options: ReplicaOptions) {
    const w = world(options);
    const a = w.device('a');
    const b = w.device('b');
    a.increment('case-1', 'visits');
    syncPair(a, b);
    // Both health workers record a visit while offline.
    a.increment('case-1', 'visits');
    b.increment('case-1', 'visits');
    syncPair(a, b);
    return { a, b };
  }

  it('a counter field keeps every concurrent increment', () => {
    const { a, b } = offlineVisits({ schema: { visits: 'counter' } });
    expect(a.value('case-1', 'visits')).toBe(3);
    expect(b.value('case-1', 'visits')).toBe(3);
  });

  it('a register field loses one of two concurrent increments', () => {
    const { a, b } = offlineVisits({});
    expect(a.value('case-1', 'visits')).toBe(2);
    expect(b.value('case-1', 'visits')).toBe(2);
  });

  it('supports decrements', () => {
    const phone = world({ schema: { visits: 'counter' } }).device('a');
    phone.increment('case-1', 'visits', 5);
    phone.increment('case-1', 'visits', -2);
    expect(phone.value('case-1', 'visits')).toBe(3);
  });
});

describe('sets', () => {
  function concurrentTagEdits(options: ReplicaOptions) {
    const w = world(options);
    const a = w.device('a');
    const b = w.device('b');
    a.addElement('case-1', 'tags', 'followup');
    syncPair(a, b);
    // Offline: a adds a new tag while b removes the existing one.
    a.addElement('case-1', 'tags', 'urgent');
    w.advance(10);
    b.removeElement('case-1', 'tags', 'followup');
    syncPair(a, b);
    return { a, b };
  }

  it('a set field keeps both the add and the remove', () => {
    const { a, b } = concurrentTagEdits({ schema: { tags: 'set' } });
    expect(a.value('case-1', 'tags')).toEqual(['urgent']);
    expect(b.value('case-1', 'tags')).toEqual(['urgent']);
  });

  it('a register list keeps only one of the two edits', () => {
    const { a } = concurrentTagEdits({});
    // b's rewrite came last, so a's "urgent" tag is gone.
    expect(a.value('case-1', 'tags')).toEqual([]);
  });

  it('keeps a tag re-added on one device while another device removes it', () => {
    const w = world({ schema: { tags: 'set' } });
    const a = w.device('a');
    const b = w.device('b');
    a.addElement('case-1', 'tags', 'urgent');
    syncPair(a, b);
    b.removeElement('case-1', 'tags', 'urgent');
    a.addElement('case-1', 'tags', 'urgent');
    syncPair(a, b);
    expect(b.value('case-1', 'tags')).toEqual(['urgent']);
  });
});

describe('schema', () => {
  it('rejects edits that do not match the field kind', () => {
    const phone = world({ schema: { visits: 'counter', tags: 'set' } }).device('a');
    expect(() => phone.set('case-1', 'visits', 3)).toThrow(TypeError);
    expect(() => phone.addElement('case-1', 'visits', 'x')).toThrow(TypeError);
    expect(() => phone.increment('case-1', 'tags')).toThrow(TypeError);
  });

  it('ignores remote ops that do not match the field kind, the same way on every device', () => {
    const w = world();
    const misconfigured = w.device('old');
    const a = new Replica('a', () => 0, { schema: { visits: 'counter' } });
    misconfigured.set('case-1', 'visits', 99);
    pull(a, misconfigured);
    a.increment('case-1', 'visits');
    expect(a.value('case-1', 'visits')).toBe(1);
  });
});
