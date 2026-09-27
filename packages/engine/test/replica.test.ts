import { describe, expect, it } from 'vitest';
import { Replica } from '../src/replica';

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
});
