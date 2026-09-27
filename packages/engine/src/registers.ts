import { compareTimestamps } from './hlc';
import type { Change, OpId, Operation } from './types';

export type SetOperation = Operation<Extract<Change, { type: 'set' }>>;

/**
 * How a register field picks its value when writes are concurrent.
 * - `lww-wall`: latest device clock wins. Naive; a device with a fast clock wins
 *   even against edits made after seeing its change.
 * - `lww-hlc`: latest hybrid logical clock wins. Respects "I saw it, then changed
 *   it", but still silently drops one of two truly concurrent writes.
 * - `multi-value`: keeps every write nobody has replaced yet, so concurrent
 *   writes surface as a conflict for a person to resolve.
 */
export type RegisterStrategy = 'lww-wall' | 'lww-hlc' | 'multi-value';

export const REGISTER_STRATEGIES: readonly RegisterStrategy[] = ['lww-wall', 'lww-hlc', 'multi-value'];

const byTimestampDesc = (a: SetOperation, b: SetOperation) => compareTimestamps(b.ts, a.ts);

const byDeviceTimeDesc = (a: SetOperation, b: SetOperation) =>
  b.deviceTime - a.deviceTime || byTimestampDesc(a, b);

/**
 * The writes still standing for one register field, the displayed one first.
 * Last-write-wins strategies always return at most one.
 *
 * A pure function of the set of ops, so replicas holding the same ops agree
 * regardless of the order the ops arrived in.
 */
export function standingWrites(strategy: RegisterStrategy, ops: readonly SetOperation[]): SetOperation[] {
  if (ops.length === 0) return [];
  switch (strategy) {
    case 'lww-wall':
      return [[...ops].sort(byDeviceTimeDesc)[0]!];
    case 'lww-hlc':
      return [[...ops].sort(byTimestampDesc)[0]!];
    case 'multi-value':
      return unreplaced(ops).sort(byTimestampDesc);
  }
}

/** Writes that no other write lists in `supersedes`. */
export function unreplaced(ops: readonly SetOperation[]): SetOperation[] {
  const replaced = new Set<OpId>();
  for (const op of ops) for (const id of op.change.supersedes) replaced.add(id);
  return ops.filter((op) => !replaced.has(op.id));
}
