import { describe, expect, it } from 'vitest';
import { Replica } from '../src/replica';
import { pull, syncPair } from '../src/sync';

const HOUR = 3_600_000;

function world() {
  let t = 1_000;
  return {
    advance: (ms: number) => (t += ms),
    /** A device clock that is `skew` ms off from true time. */
    clock: (skew = 0) => () => t + skew,
  };
}

describe('Replica', () => {
  it('reads back its own edits', () => {
    const w = world();
    const phone = new Replica('a', w.clock());
    phone.set('case-1', 'name', 'Asha');
    phone.set('case-1', 'visits', 1);
    expect(phone.read('case-1')).toEqual({ name: 'Asha', visits: 1 });
    expect(phone.read('missing')).toBeUndefined();
  });

  it('keeps both edits when two devices change different fields offline', () => {
    const w = world();
    const a = new Replica('a', w.clock());
    const b = new Replica('b', w.clock());
    a.set('case-1', 'name', 'Asha');
    b.set('case-1', 'visits', 3);
    syncPair(a, b);
    expect(a.snapshot()).toEqual({ 'case-1': { name: 'Asha', visits: 3 } });
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('agrees on one winner when both devices change the same field offline', () => {
    const w = world();
    const a = new Replica('a', w.clock());
    const b = new Replica('b', w.clock());
    a.set('case-1', 'status', 'open');
    w.advance(10);
    b.set('case-1', 'status', 'closed');
    syncPair(a, b);
    expect(a.read('case-1')).toEqual({ status: 'closed' });
    expect(b.read('case-1')).toEqual({ status: 'closed' });
  });

  it('lets a later edit win even when the earlier writer’s clock runs an hour ahead', () => {
    const w = world();
    const fast = new Replica('fast', w.clock(HOUR));
    const honest = new Replica('honest', w.clock());
    fast.set('case-1', 'status', 'open');
    pull(honest, fast);
    w.advance(1_000);
    // honest saw "open" and then changed it, so its edit must win.
    honest.set('case-1', 'status', 'closed');
    pull(fast, honest);
    expect(fast.read('case-1')).toEqual({ status: 'closed' });
    expect(honest.read('case-1')).toEqual({ status: 'closed' });
  });

  it('documents the limit of LWW: a concurrent edit from a fast clock silently wins', () => {
    const w = world();
    const fast = new Replica('fast', w.clock(HOUR));
    const honest = new Replica('honest', w.clock());
    fast.set('case-1', 'status', 'open');
    w.advance(1_000);
    // Neither device has seen the other's edit, so this is a true conflict.
    honest.set('case-1', 'status', 'closed');
    syncPair(fast, honest);
    expect(honest.read('case-1')).toEqual({ status: 'open' });
    expect(honest.winner('case-1', 'status')?.node).toBe('fast');
  });

  it('ignores duplicate deliveries', () => {
    const w = world();
    const a = new Replica('a', w.clock());
    const b = new Replica('b', w.clock());
    const op = a.set('case-1', 'visits', 1);
    expect(b.receive([op, op])).toEqual([op]);
    expect(b.receive([op])).toEqual([]);
    expect(b.read('case-1')).toEqual({ visits: 1 });
  });

  it('handles ops arriving out of order and tracks the gap in its version vector', () => {
    const w = world();
    const a = new Replica('a', w.clock());
    const b = new Replica('b', w.clock());
    const first = a.set('case-1', 'visits', 1);
    w.advance(5);
    const second = a.set('case-1', 'visits', 2);

    b.receive([second]);
    expect(b.read('case-1')).toEqual({ visits: 2 });
    expect(b.versionVector()).toEqual({ a: 0 });

    b.receive([first]);
    expect(b.read('case-1')).toEqual({ visits: 2 });
    expect(b.versionVector()).toEqual({ a: 2 });
  });

  it('only sends what the peer is missing', () => {
    const w = world();
    const a = new Replica('a', w.clock());
    const b = new Replica('b', w.clock());
    a.set('case-1', 'name', 'Asha');
    pull(b, a);
    const newer = a.set('case-1', 'visits', 1);
    expect(a.missingFor(b.versionVector())).toEqual([newer]);
    expect(b.missingFor(a.versionVector())).toEqual([]);
  });

  it('relays edits through a middle device', () => {
    const w = world();
    const a = new Replica('a', w.clock());
    const b = new Replica('b', w.clock());
    const c = new Replica('c', w.clock());
    a.set('case-1', 'name', 'Asha');
    pull(b, a);
    pull(c, b);
    expect(c.read('case-1')).toEqual({ name: 'Asha' });
    expect(c.versionVector()).toEqual({ a: 1 });
  });
});
