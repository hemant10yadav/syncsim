import { compareTimestamps, HybridClock } from './hlc';
import { standingWrites, unreplaced, type RegisterStrategy, type SetOperation } from './registers';
import type {
  Change,
  Conflict,
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

export interface ReplicaOptions {
  /** How register fields resolve concurrent writes. Defaults to `lww-hlc`. */
  readonly registers?: RegisterStrategy;
}

/**
 * One device's copy of the data.
 *
 * Every edit is kept as an Operation in a log, and the readable state is derived
 * from the log on demand by the chosen RegisterStrategy. Each strategy is a pure
 * function of the set of ops, and applying an op twice changes nothing, so
 * replicas that hold the same ops always show the same state, whatever order the
 * ops arrived in.
 *
 * Because state is derived, switching the register strategy re-reads the same
 * history under a different rule; nothing in the log changes.
 */
export class Replica {
  readonly node: NodeId;
  readonly #clock: HybridClock;
  readonly #physicalNow: () => number;
  #strategy: RegisterStrategy;
  #seq = 0;
  readonly #log = new Map<OpId, Operation>();
  readonly #contiguous = new Map<NodeId, number>();
  /** Seqs received ahead of a gap, waiting for the gap to fill. */
  readonly #pending = new Map<NodeId, Set<number>>();
  /** Ops per record and field, in arrival order. */
  readonly #fieldOps = new Map<RecordId, Map<FieldName, Operation[]>>();

  constructor(node: NodeId, physicalNow: () => number, options: ReplicaOptions = {}) {
    this.node = node;
    this.#physicalNow = physicalNow;
    this.#clock = new HybridClock(node, physicalNow);
    this.#strategy = options.registers ?? 'lww-hlc';
  }

  get registerStrategy(): RegisterStrategy {
    return this.#strategy;
  }

  setRegisterStrategy(strategy: RegisterStrategy): void {
    this.#strategy = strategy;
  }

  /** Overwrite a field. Replaces every value currently standing for it. */
  set(record: RecordId, field: FieldName, value: FieldValue): Operation {
    const supersedes = unreplaced(this.#opsOf(record, field)).map((op) => op.id);
    return this.#local(record, field, { type: 'set', value, supersedes });
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

  /** Current value of one field, or undefined if it has never been written. */
  value(record: RecordId, field: FieldName): FieldValue | undefined {
    return this.winner(record, field)?.change.value;
  }

  read(record: RecordId): RecordState | undefined {
    const fields = this.#fieldOps.get(record);
    if (!fields) return undefined;
    const state: Record<FieldName, FieldValue> = {};
    for (const field of fields.keys()) {
      const value = this.value(record, field);
      if (value !== undefined) state[field] = value;
    }
    return state;
  }

  snapshot(): Snapshot {
    return Object.fromEntries(
      [...this.#fieldOps.keys()].map((record) => [record, this.read(record)!]),
    );
  }

  /** The write currently displayed for a field, for explaining why a value is what it is. */
  winner(record: RecordId, field: FieldName): SetOperation | undefined {
    return this.#standing(record, field)[0];
  }

  /** Fields with more than one standing write. Only the multi-value strategy produces these. */
  conflicts(): Conflict[] {
    const found: Conflict[] = [];
    for (const [record, fields] of this.#fieldOps) {
      for (const field of fields.keys()) {
        const candidates = this.#standing(record, field);
        if (candidates.length > 1) found.push({ record, field, candidates });
      }
    }
    return found;
  }

  #standing(record: RecordId, field: FieldName): SetOperation[] {
    return standingWrites(this.#strategy, this.#opsOf(record, field));
  }

  #opsOf(record: RecordId, field: FieldName): SetOperation[] {
    return this.#fieldOps.get(record)?.get(field) ?? [];
  }

  #local(record: RecordId, field: FieldName, change: Change): Operation {
    const seq = ++this.#seq;
    const op: Operation = {
      id: `${this.node}:${seq}`,
      node: this.node,
      seq,
      record,
      field,
      change,
      deviceTime: this.#physicalNow(),
      ts: this.#clock.now(),
    };
    this.#ingest(op);
    return op;
  }

  #ingest(op: Operation): void {
    this.#log.set(op.id, op);
    this.#advanceVersion(op);

    let fields = this.#fieldOps.get(op.record);
    if (!fields) {
      fields = new Map();
      this.#fieldOps.set(op.record, fields);
    }
    const ops = fields.get(op.field);
    if (ops) ops.push(op);
    else fields.set(op.field, [op]);
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
