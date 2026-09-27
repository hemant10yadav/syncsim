import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { counterValue, orSetElements, type IncrementOperation, type SetElementOperation } from '../src/crdt';

const base = (id: string) => ({
  id,
  node: id.split(':')[0]!,
  seq: 1,
  record: 'case-1',
  deviceTime: 0,
  ts: { wall: 0, counter: 0, node: id.split(':')[0]! },
});

const inc = (id: string, by: number): IncrementOperation => ({
  ...base(id),
  field: 'visits',
  change: { type: 'increment', by },
});

const add = (id: string, element: string): SetElementOperation => ({
  ...base(id),
  field: 'tags',
  change: { type: 'add', element },
});

const remove = (id: string, element: string, observed: string[]): SetElementOperation => ({
  ...base(id),
  field: 'tags',
  change: { type: 'remove', element, observed },
});

describe('counterValue', () => {
  it('sums increments and decrements', () => {
    expect(counterValue([])).toBe(0);
    expect(counterValue([inc('a:1', 1), inc('b:1', 1), inc('a:2', -3)])).toBe(-1);
  });
});

describe('orSetElements', () => {
  it('shows added elements once, sorted', () => {
    expect(orSetElements([add('a:1', 'urgent'), add('b:1', 'followup'), add('c:1', 'urgent')])).toEqual([
      'followup',
      'urgent',
    ]);
  });

  it('removes an element whose adds were all observed', () => {
    expect(orSetElements([add('a:1', 'urgent'), remove('b:1', 'urgent', ['a:1'])])).toEqual([]);
  });

  it('keeps an element added concurrently with its removal (add wins)', () => {
    const ops = [add('a:1', 'urgent'), remove('b:1', 'urgent', ['a:1']), add('c:1', 'urgent')];
    expect(orSetElements(ops)).toEqual(['urgent']);
  });

  it('lets a removed element be added again', () => {
    const ops = [add('a:1', 'urgent'), remove('a:2', 'urgent', ['a:1']), add('a:3', 'urgent')];
    expect(orSetElements(ops)).toEqual(['urgent']);
  });

  it('treats removing something never seen as a no-op', () => {
    expect(orSetElements([remove('a:1', 'urgent', []), add('b:1', 'urgent')])).toEqual(['urgent']);
  });
});

describe('CRDT order independence', () => {
  it('gives the same counter and set whatever order the ops arrive in', () => {
    const increments = fc
      .array(fc.integer({ min: -5, max: 5 }), { maxLength: 15 })
      .map((bys) => bys.map((by, i) => inc(`a:${i}`, by)));
    const elements = fc
      .array(fc.tuple(fc.boolean(), fc.constantFrom('x', 'y', 'z')), { maxLength: 15 })
      .map((specs) => {
        const ops: SetElementOperation[] = [];
        specs.forEach(([isAdd, element], i) => {
          const observed = ops
            .filter((op) => op.change.type === 'add' && op.change.element === element && i % 2 === 0)
            .map((op) => op.id);
          ops.push(isAdd ? add(`n:${i}`, element) : remove(`n:${i}`, element, observed));
        });
        return ops;
      });
    const withShuffle = <T>(arb: fc.Arbitrary<T[]>) =>
      arb.chain((ops) => fc.tuple(fc.constant(ops), fc.shuffledSubarray(ops, { minLength: ops.length })));

    fc.assert(
      fc.property(withShuffle(increments), withShuffle(elements), ([incs, incsShuffled], [els, elsShuffled]) => {
        expect(counterValue(incsShuffled)).toBe(counterValue(incs));
        expect(orSetElements(elsShuffled)).toEqual(orSetElements(els));
      }),
    );
  });
});
