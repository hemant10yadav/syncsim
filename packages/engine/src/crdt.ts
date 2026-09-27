import type { Change, OpId, Operation } from './types';

export type IncrementOperation = Operation<Extract<Change, { type: 'increment' }>>;
export type SetElementOperation = Operation<Extract<Change, { type: 'add' | 'remove' }>>;

export const isIncrement = (op: Operation): op is IncrementOperation => op.change.type === 'increment';
export const isSetElement = (op: Operation): op is SetElementOperation =>
  op.change.type === 'add' || op.change.type === 'remove';

/**
 * PN-counter: the value is the sum of every increment (negative for decrements).
 * Each increment is its own op and the log applies each op once, so concurrent
 * increments from different devices are never lost.
 */
export function counterValue(ops: readonly IncrementOperation[]): number {
  return ops.reduce((sum, op) => sum + op.change.by, 0);
}

/**
 * Observed-remove set: every add is tagged with its op id, and a remove cancels
 * only the tags its writer had seen. An add made concurrently with a remove
 * therefore survives ("add wins"), and a removed element can be added again.
 */
export function orSetElements(ops: readonly SetElementOperation[]): string[] {
  return [...new Set(liveAdds(ops).map((op) => op.change.element))].sort();
}

/** Adds not cancelled by any remove. */
export function liveAdds(ops: readonly SetElementOperation[]): SetElementOperation[] {
  const cancelled = new Set<OpId>();
  for (const op of ops) {
    if (op.change.type === 'remove') for (const id of op.change.observed) cancelled.add(id);
  }
  return ops.filter((op) => op.change.type === 'add' && !cancelled.has(op.id));
}
