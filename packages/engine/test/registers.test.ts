import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REGISTER_STRATEGIES, standingWrites, type SetOperation } from '../src/registers';
import type { FieldValue } from '../src/types';

interface WriteSpec {
  value: FieldValue;
  wall: number;
  node: string;
  counter?: number;
  deviceTime?: number;
  supersedes?: string[];
}

function write(id: string, { value, wall, node, counter = 0, deviceTime = wall, supersedes = [] }: WriteSpec): SetOperation {
  return {
    id,
    node,
    seq: 1,
    record: 'case-1',
    field: 'status',
    change: { type: 'set', value, supersedes },
    ts: { wall, counter, node },
    deviceTime,
  };
}

const values = (ops: SetOperation[]) => ops.map((op) => op.change.value);

describe('standingWrites', () => {
  it('returns nothing for a field that was never written', () => {
    for (const strategy of REGISTER_STRATEGIES) expect(standingWrites(strategy, [])).toEqual([]);
  });

  it('lww-wall trusts device clocks, even when the logical order says otherwise', () => {
    // "open" was written first but on a device whose clock read far ahead.
    const open = write('a:1', { value: 'open', wall: 10, node: 'a', deviceTime: 9_000 });
    const closed = write('b:1', { value: 'closed', wall: 20, node: 'b', deviceTime: 30 });
    expect(values(standingWrites('lww-wall', [open, closed]))).toEqual(['open']);
    expect(values(standingWrites('lww-hlc', [open, closed]))).toEqual(['closed']);
  });

  it('multi-value keeps concurrent writes, newest logical timestamp first', () => {
    const open = write('a:1', { value: 'open', wall: 10, node: 'a' });
    const closed = write('b:1', { value: 'closed', wall: 20, node: 'b' });
    expect(values(standingWrites('multi-value', [open, closed]))).toEqual(['closed', 'open']);
  });

  it('multi-value drops a write once a later write has replaced it', () => {
    const open = write('a:1', { value: 'open', wall: 10, node: 'a' });
    const closed = write('b:1', { value: 'closed', wall: 20, node: 'b', supersedes: ['a:1'] });
    expect(values(standingWrites('multi-value', [open, closed]))).toEqual(['closed']);
  });

  it('multi-value resolves a conflict when one write replaces every candidate', () => {
    const open = write('a:1', { value: 'open', wall: 10, node: 'a' });
    const closed = write('b:1', { value: 'closed', wall: 20, node: 'b' });
    const resolved = write('a:2', { value: 'resolved', wall: 5, node: 'a', supersedes: ['a:1', 'b:1'] });
    // The resolution wins even though its timestamp is the oldest: replacement is explicit.
    expect(values(standingWrites('multi-value', [open, closed, resolved]))).toEqual(['resolved']);
  });

  it('gives the same answer whatever order the writes arrive in', () => {
    const writes = fc
      .uniqueArray(
        fc.record({
          node: fc.constantFrom('a', 'b', 'c'),
          wall: fc.integer({ min: 0, max: 50 }),
          counter: fc.integer({ min: 0, max: 3 }),
          deviceTime: fc.integer({ min: 0, max: 50 }),
          value: fc.constantFrom('open', 'closed', 'pending'),
        }),
        { maxLength: 12, selector: (w) => `${w.node}-${w.wall}-${w.counter}` },
      )
      .map((specs) =>
        specs.map((spec, i) =>
          write(`${spec.node}:${i}`, { ...spec, supersedes: i > 0 && i % 3 === 0 ? [`${specs[i - 1]!.node}:${i - 1}`] : [] }),
        ),
      );

    fc.assert(
      fc.property(
        writes.chain((ops) => fc.tuple(fc.constant(ops), fc.shuffledSubarray(ops, { minLength: ops.length }))),
        fc.constantFrom(...REGISTER_STRATEGIES),
        ([ops, shuffled], strategy) => {
          expect(standingWrites(strategy, shuffled)).toEqual(standingWrites(strategy, ops));
        },
      ),
    );
  });
});
