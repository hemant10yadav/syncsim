import { compareTimestamps, HybridClock } from './hlc';
import type {
  FieldName,
  FieldValue,
  NodeId,
  OpId,
  Operation,
  RecordId,
  RecordState,
  Snapshot,
  VersionVector,
} from './types';

interface Register {
  readonly value: FieldValue;
  readonly op: Operation;
}

/**
 * One device's copy of the data.
 *
 * Every edit is kept as an Operation in a log. The readable state is derived
 * from the log with per-field last-write-wins: for each field, the op with the
 * greatest timestamp decides the value. Because that rule does not depend on
 * the order ops arrive in, and applying an op twice changes nothing, replicas
 * that hold the same set of ops always show the same state.
 */
export class Replica {
  readonly node: NodeId;
  readonly #clock: HybridClock;
  #seq = 0;
  readonly #log = new Map<OpId, Operation>();
  readonly #contiguous = new Map<NodeId, number>();
  /** Seqs received ahead of a gap, waiting for the gap to fill. */
  readonly #pending = new Map<NodeId, Set<number>>();
  readonly #records = new Map<RecordId, Map<FieldName, Register>>();

  constructor(node: NodeId, physicalNow: () => number) {
    this.node = node;
    this.#clock = new HybridClock(node, physicalNow);
  }

  set(record: RecordId, field: FieldName, value: FieldValue): Operation {
    const seq = ++this.#seq;
    const op: Operation = {
      id: `${this.node}:${seq}`,
      node: this.node,
      seq,
      record,
      field,
      value,
      ts: this.#clock.now(),
    };
    this.#ingest(op);
    return op;
  }

  /** Apply ops from peers. Duplicates and out-of-order delivery are fine. Returns the ops that were new. */
  receive(ops: Iterable<Operation>): Operation[] {
    const fresh: Operation[] = [];
    for (const op of ops) {
      if (this.#log.has(op.id)) continue;
      this.#clock.receive(op.ts);
      this.#ingest(op);
      fresh.push(op);
    }
    return fresh;
  }

  versionVector(): VersionVector {
    return Object.fromEntries(this.#contiguous);
  }

  /**
   * Ops a peer with version vector `known` may be missing. Ops past a gap in the
   * peer's vector are included too; the peer drops any it already has.
   */
  missingFor(known: VersionVector): Operation[] {
    const missing: Operation[] = [];
    for (const op of this.#log.values()) {
      if (op.seq > (known[op.node] ?? 0)) missing.push(op);
    }
    return missing.sort((a, b) => compareTimestamps(a.ts, b.ts));
  }

  read(record: RecordId): RecordState | undefined {
    const fields = this.#records.get(record);
    if (!fields) return undefined;
    return Object.fromEntries([...fields].map(([name, reg]) => [name, reg.value]));
  }

  snapshot(): Snapshot {
    return Object.fromEntries(
      [...this.#records.keys()].map((record) => [record, this.read(record)!]),
    );
  }

  /** Winning op for a field, for explaining why a value is what it is. */
  winner(record: RecordId, field: FieldName): Operation | undefined {
    return this.#records.get(record)?.get(field)?.op;
  }

  #ingest(op: Operation): void {
    this.#log.set(op.id, op);
    this.#advanceVersion(op);

    let fields = this.#records.get(op.record);
    if (!fields) {
      fields = new Map();
      this.#records.set(op.record, fields);
    }
    const current = fields.get(op.field);
    if (!current || compareTimestamps(op.ts, current.op.ts) > 0) {
      fields.set(op.field, { value: op.value, op });
    }
  }

  #advanceVersion(op: Operation): void {
    let pending = this.#pending.get(op.node);
    if (!pending) {
      pending = new Set();
      this.#pending.set(op.node, pending);
    }
    pending.add(op.seq);

    let upTo = this.#contiguous.get(op.node) ?? 0;
    while (pending.delete(upTo + 1)) upTo++;
    this.#contiguous.set(op.node, upTo);
  }
}
