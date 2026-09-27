import { counterValue, isIncrement, isSetElement, liveAdds, orSetElements } from './crdt';
import { compareTimestamps, HybridClock } from './hlc';
import { isSet, standingWrites, unreplaced, type RegisterStrategy, type SetOperation } from './registers';
import type {
  Change,
  Conflict,
  FieldKind,
  FieldName,
  FieldValue,
  NodeId,
  OpId,
  Operation,
  RecordId,
  RecordState,
  Schema,
  Snapshot,
  VersionVector,
} from './types';

export interface ReplicaOptions {
  /** Field kinds; unlisted fields are registers. Must match on every replica. */
  readonly schema?: Schema;
  /** How register fields resolve concurrent writes. Defaults to `lww-hlc`. */
  readonly registers?: RegisterStrategy;
}

/**
 * One device's copy of the data.
 *
 * Every edit is kept as an Operation in a log, and the readable state is derived
 * from the log on demand: registers by the chosen RegisterStrategy, counters and
 * sets by their CRDT rules. Each rule is a pure function of the set of ops, and
 * applying an op twice changes nothing, so replicas that hold the same ops always
 * show the same state, whatever order the ops arrived in.
 *
 * Because state is derived, switching the register strategy re-reads the same
 * history under a different rule; nothing in the log changes.
 */
export class Replica {
  readonly node: NodeId;
  readonly #clock: HybridClock;
  readonly #physicalNow: () => number;
  readonly #schema: Schema;
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
    this.#schema = options.schema ?? {};
    this.#strategy = options.registers ?? 'lww-hlc';
  }

  get registerStrategy(): RegisterStrategy {
    return this.#strategy;
  }

  setRegisterStrategy(strategy: RegisterStrategy): void {
    this.#strategy = strategy;
  }

  kindOf(field: FieldName): FieldKind {
    return this.#schema[field] ?? 'register';
  }

  /** Overwrite a register field. Replaces every value currently standing for it. */
  set(record: RecordId, field: FieldName, value: FieldValue): Operation {
    this.#expectKind(field, 'register', 'set');
    const supersedes = unreplaced(this.#opsOf(record, field, isSet)).map((op) => op.id);
    return this.#local(record, field, { type: 'set', value, supersedes });
  }

  /**
   * Add `by` to a number. On a counter field this is a CRDT increment. On a
   * register field it does what a naive app does: read the value, write value + by,
   * which loses increments made concurrently elsewhere.
   */
  increment(record: RecordId, field: FieldName, by = 1): Operation {
    if (this.kindOf(field) === 'register') {
      const current = this.value(record, field);
      return this.set(record, field, (typeof current === 'number' ? current : 0) + by);
    }
    this.#expectKind(field, 'counter', 'increment');
    return this.#local(record, field, { type: 'increment', by });
  }

  /** Add a string to a set field, or, on a register field, rewrite the whole list. */
  addElement(record: RecordId, field: FieldName, element: string): Operation {
    if (this.kindOf(field) === 'register') {
      return this.set(record, field, [...new Set([...this.#list(record, field), element])].sort());
    }
    this.#expectKind(field, 'set', 'addElement');
    return this.#local(record, field, { type: 'add', element });
  }

  /** Remove a string from a set field, or, on a register field, rewrite the whole list. */
  removeElement(record: RecordId, field: FieldName, element: string): Operation {
    if (this.kindOf(field) === 'register') {
      return this.set(record, field, this.#list(record, field).filter((e) => e !== element));
    }
    this.#expectKind(field, 'set', 'removeElement');
    const observed = liveAdds(this.#opsOf(record, field, isSetElement))
      .filter((op) => op.change.element === element)
      .map((op) => op.id);
    return this.#local(record, field, { type: 'remove', element, observed });
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
    switch (this.kindOf(field)) {
      case 'register':
        return this.winner(record, field)?.change.value;
      case 'counter': {
        const ops = this.#opsOf(record, field, isIncrement);
        return ops.length > 0 ? counterValue(ops) : undefined;
      }
      case 'set': {
        const ops = this.#opsOf(record, field, isSetElement);
        return ops.length > 0 ? orSetElements(ops) : undefined;
      }
    }
  }

  read(record: RecordId): RecordState | undefined {
    const fields = this.#fieldOps.get(record);
    if (!fields) return undefined;
    const state: Record<FieldName, FieldValue> = {};
    for (const field of sortedKeys(fields)) {
      const value = this.value(record, field);
      if (value !== undefined) state[field] = value;
    }
    return state;
  }

  snapshot(): Snapshot {
    return Object.fromEntries(sortedKeys(this.#fieldOps).map((record) => [record, this.read(record)!]));
  }

  /** The write currently displayed for a register field, for explaining why a value is what it is. */
  winner(record: RecordId, field: FieldName): SetOperation | undefined {
    return this.#standing(record, field)[0];
  }

  /**
   * Register fields with more than one standing write, sorted by record then field.
   * Only the multi-value strategy produces these.
   */
  conflicts(): Conflict[] {
    const found: Conflict[] = [];
    for (const record of sortedKeys(this.#fieldOps)) {
      for (const field of sortedKeys(this.#fieldOps.get(record)!)) {
        if (this.kindOf(field) !== 'register') continue;
        const candidates = this.#standing(record, field);
        if (candidates.length > 1) found.push({ record, field, candidates });
      }
    }
    return found;
  }

  #standing(record: RecordId, field: FieldName): SetOperation[] {
    return standingWrites(this.#strategy, this.#opsOf(record, field, isSet));
  }

  #list(record: RecordId, field: FieldName): readonly string[] {
    const current = this.value(record, field);
    return Array.isArray(current) ? current : [];
  }

  #expectKind(field: FieldName, kind: FieldKind, method: string): void {
    const actual = this.kindOf(field);
    if (actual !== kind) throw new TypeError(`Cannot ${method} "${field}": it is a ${actual} field`);
  }

  /**
   * Ops of one field that match `guard`. Ops whose change does not match the field's
   * kind (possible only if replicas disagree on the schema) are ignored by every
   * replica alike, so state still converges.
   */
  #opsOf<T extends Operation>(record: RecordId, field: FieldName, guard: (op: Operation) => op is T): T[] {
    return (this.#fieldOps.get(record)?.get(field) ?? []).filter(guard);
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

/**
 * Map keys in a fixed order. Maps iterate in arrival order, which differs between
 * devices, so anything shown to a user is sorted to look the same everywhere.
 */
const sortedKeys = <K extends string>(map: ReadonlyMap<K, unknown>): K[] => [...map.keys()].sort();

