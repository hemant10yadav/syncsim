import type { Timestamp } from './hlc';

export type NodeId = string;
export type RecordId = string;
export type FieldName = string;
export type FieldValue = string | number | boolean | null;

/** `${node}:${seq}`, unique across the whole system. */
export type OpId = string;

export type Change = {
  readonly type: 'set';
  readonly value: FieldValue;
  /** Ids of the values the writer had on screen for this field, which this write replaces. */
  readonly supersedes: readonly OpId[];
};

export type ChangeType = Change['type'];

/**
 * One local edit to a single field of a single record.
 *
 * `seq` counts the ops a node has produced (1, 2, 3, ...). Together with `node`
 * it lets peers describe exactly which ops they already hold (see VersionVector).
 */
export interface Operation<C extends Change = Change> {
  readonly id: OpId;
  readonly node: NodeId;
  readonly seq: number;
  readonly record: RecordId;
  readonly field: FieldName;
  readonly change: C;
  readonly ts: Timestamp;
  /** The device's own clock reading when the edit was made, however wrong it is. */
  readonly deviceTime: number;
}

/** For each node, the highest seq such that every op 1..seq from that node is held. */
export type VersionVector = Readonly<Record<NodeId, number>>;

export type RecordState = Readonly<Record<FieldName, FieldValue>>;
export type Snapshot = Readonly<Record<RecordId, RecordState>>;

/** A register field holding more than one concurrent value (multi-value strategy only). */
export interface Conflict {
  readonly record: RecordId;
  readonly field: FieldName;
  /** The competing writes, the one currently displayed first. */
  readonly candidates: readonly Operation<Extract<Change, { type: 'set' }>>[];
}
