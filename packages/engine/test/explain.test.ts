import { describe, expect, it } from 'vitest';
import type { RegisterStrategy } from '../src/registers';
import { Replica } from '../src/replica';
import { pull, syncPair } from '../src/sync';

const HOUR = 3_600_000;

function world(registers: RegisterStrategy = 'lww-hlc') {
  let t = 1_000;
  const schema = { visits: 'counter', tags: 'set' } as const;
  return {
    advance: (ms: number) => (t += ms),
    device: (id: string, skew = 0) => new Replica(id, () => t + skew, { schema, registers }),
  };
}

const verdicts = (replica: Replica, field: string) =>
  replica.explain('case-1', field).map(({ op, verdict }) => [op.id, verdict.kind]);

describe('Replica.explain', () => {
  it('marks a concurrent write that last-write-wins discarded as silently lost', () => {
    const w = world('lww-hlc');
    const a = w.device('a');
    const b = w.device('b');
    a.set('case-1', 'status', 'visited');
    w.advance(10);
    b.set('case-1', 'status', 'referred');
    syncPair(a, b);
    expect(verdicts(a, 'status')).toEqual([
      ['a:1', 'lost'],
      ['b:1', 'shown'],
    ]);
    expect(a.explain('case-1', 'status')[0]!.verdict).toEqual({ kind: 'lost', to: 'b:1' });
  });

  it('marks a write whose replacement was made after seeing it as replaced, not lost', () => {
    const w = world('lww-hlc');
    const a = w.device('a');
    const b = w.device('b');
    a.set('case-1', 'status', 'visited');
    pull(b, a);
    b.set('case-1', 'status', 'closed');
    expect(b.explain('case-1', 'status')[0]!.verdict).toEqual({ kind: 'replaced', by: ['b:1'] });
  });

  it('shows the same history as competing values under multi-value', () => {
    const w = world('lww-hlc');
    const a = w.device('a');
    const b = w.device('b');
    a.set('case-1', 'status', 'visited');
    b.set('case-1', 'status', 'referred');
    syncPair(a, b);
    a.setRegisterStrategy('multi-value');
    expect(verdicts(a, 'status').map(([, kind]) => kind).sort()).toEqual(['competing', 'shown']);
  });

  it('under device-clock wins, blames the fast clock for beating a newer edit', () => {
    const w = world('lww-wall');
    const fast = w.device('fast', HOUR);
    const honest = w.device('honest');
    honest.set('case-1', 'status', 'closed');
    w.advance(1_000);
    fast.set('case-1', 'status', 'visited');
    syncPair(fast, honest);
    // honest's edit is lost even though fast never saw it: the fast clock decided.
    expect(verdicts(honest, 'status')).toEqual([
      ['honest:1', 'lost'],
      ['fast:1', 'shown'],
    ]);
  });

  it('counts every increment', () => {
    const w = world();
    const a = w.device('a');
    a.increment('case-1', 'visits');
    a.increment('case-1', 'visits', 2);
    expect(verdicts(a, 'visits')).toEqual([
      ['a:1', 'counted'],
      ['a:2', 'counted'],
    ]);
  });

  it('tells a removed tag from one that survived a concurrent remove', () => {
    const w = world();
    const a = w.device('a');
    const b = w.device('b');
    a.addElement('case-1', 'tags', 'urgent');
    syncPair(a, b);
    b.removeElement('case-1', 'tags', 'urgent');
    w.advance(10);
    a.addElement('case-1', 'tags', 'urgent');
    syncPair(a, b);
    expect(a.explain('case-1', 'tags').map(({ op, verdict }) => [op.id, verdict])).toEqual([
      ['a:1', { kind: 'removed', by: ['b:1'] }],
      ['b:1', { kind: 'remove', cancelled: 1 }],
      ['a:2', { kind: 'present' }],
    ]);
  });

  it('returns nothing for a field never written', () => {
    expect(world().device('a').explain('case-1', 'status')).toEqual([]);
  });
});
