import type { Timestamp } from './hlc';

export type NodeId = string;
export type RecordId = string;
export type FieldName = string;
export type FieldValue = string | number | boolean | null;

/** `${node}:${seq}`, unique across the whole system. */
export type OpId = string;

/**
 * One local edit: set a single field of a single record.
 *
 * `seq` counts the ops a node has produced (1, 2, 3, ...). Together with `node`
 * it lets peers describe exactly which ops they already hold (see VersionVector).
 */
export interface Operation {
  readonly id: OpId;
  readonly node: NodeId;
  readonly seq: number;
  readonly record: RecordId;
  readonly field: FieldName;
  readonly value: FieldValue;
  readonly ts: Timestamp;
}

/** For each node, the highest seq such that every op 1..seq from that node is held. */
export type VersionVector = Readonly<Record<NodeId, number>>;

export type RecordState = Readonly<Record<FieldName, FieldValue>>;
export type Snapshot = Readonly<Record<RecordId, RecordState>>;
