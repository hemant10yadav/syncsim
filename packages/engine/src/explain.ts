import { compareTimestamps } from './hlc';
import { isIncrement, isSetElement, liveAdds, type SetElementOperation } from './crdt';
import { isSet, standingWrites, type RegisterStrategy, type SetOperation } from './registers';
import type { FieldKind, OpId, Operation } from './types';

/** What became of one edit to a field. */
export type Verdict =
  /** Register: the value on screen. */
  | { readonly kind: 'shown' }
  /** Register, multi-value only: one of several concurrent values still standing. */
  | { readonly kind: 'competing' }
  /** Register: a later write whose author had seen this one replaced it. */
  | { readonly kind: 'replaced'; readonly by: readonly OpId[] }
  /** Register: discarded by last-write-wins in favour of `to`, whose author never saw it. */
  | { readonly kind: 'lost'; readonly to: OpId }
  /** Counter: every increment counts. */
  | { readonly kind: 'counted' }
  /** Set: an add that no remove has cancelled. */
  | { readonly kind: 'present' }
  /** Set: an add cancelled by the removes in `by`. */
  | { readonly kind: 'removed'; readonly by: readonly OpId[] }
  /** Set: a remove, and how many adds it cancelled. */
  | { readonly kind: 'remove'; readonly cancelled: number };

export interface ExplainedOp {
  readonly op: Operation;
  readonly verdict: Verdict;
}

/**
 * Every edit to one field, oldest first, with what became of it under `strategy`.
 * Ops whose change does not match the field kind are left out, as they are when
 * the value is computed.
 */
export function explainField(kind: FieldKind, strategy: RegisterStrategy, ops: readonly Operation[]): ExplainedOp[] {
  const explained =
    kind === 'register'
      ? explainRegister(strategy, ops.filter(isSet))
      : kind === 'counter'
        ? ops.filter(isIncrement).map((op) => ({ op, verdict: { kind: 'counted' } as const }))
        : explainSet(ops.filter(isSetElement));
  return explained.sort((a, b) => compareTimestamps(a.op.ts, b.op.ts));
}

function explainRegister(strategy: RegisterStrategy, ops: readonly SetOperation[]): ExplainedOp[] {
  const standing = standingWrites(strategy, ops);
  const winner = standing[0];
  const replacedBy = new Map<OpId, OpId[]>();
  for (const op of ops) {
    for (const id of op.change.supersedes) replacedBy.set(id, [...(replacedBy.get(id) ?? []), op.id]);
  }
  return ops.map((op): ExplainedOp => {
    if (op === winner) return { op, verdict: { kind: 'shown' } };
    if (standing.includes(op)) return { op, verdict: { kind: 'competing' } };
    const by = replacedBy.get(op.id);
    if (by) return { op, verdict: { kind: 'replaced', by } };
    // Not replaced and not standing: only last-write-wins discards a write like this.
    return { op, verdict: { kind: 'lost', to: winner!.id } };
  });
}

function explainSet(ops: readonly SetElementOperation[]): ExplainedOp[] {
  const live = new Set(liveAdds(ops).map((op) => op.id));
  const cancelledBy = new Map<OpId, OpId[]>();
  for (const op of ops) {
    if (op.change.type !== 'remove') continue;
    for (const id of op.change.observed) cancelledBy.set(id, [...(cancelledBy.get(id) ?? []), op.id]);
  }
  return ops.map((op): ExplainedOp => {
    if (op.change.type === 'remove') return { op, verdict: { kind: 'remove', cancelled: op.change.observed.length } };
    if (live.has(op.id)) return { op, verdict: { kind: 'present' } };
    return { op, verdict: { kind: 'removed', by: cancelledBy.get(op.id) ?? [] } };
  });
}
