import type { RegisterStrategy } from './registers';
import { Replica } from './replica';
import { createRng, type Rng } from './rng';
import type { FieldName, FieldValue, NodeId, Operation, RecordId, VersionVector } from './types';

export interface NetworkConditions {
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  /** Probability that a message is lost in transit. */
  readonly dropRate: number;
  /** Probability that a message is delivered a second time. */
  readonly duplicateRate: number;
}

export const PERFECT_NETWORK: NetworkConditions = {
  minLatencyMs: 50,
  maxLatencyMs: 50,
  dropRate: 0,
  duplicateRate: 0,
};

export type Payload =
  | { readonly kind: 'sync-request'; readonly known: VersionVector }
  | { readonly kind: 'sync-response'; readonly ops: readonly Operation[] };

export interface Message {
  readonly id: number;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly sentAt: number;
  readonly deliverAt: number;
  readonly payload: Payload;
  /** True for the extra copy created by a duplicate delivery. */
  readonly duplicate: boolean;
}

export type DropReason = 'lost' | 'offline' | 'partitioned';

export type SimEvent =
  | { readonly kind: 'edit'; readonly at: number; readonly op: Operation }
  | { readonly kind: 'send'; readonly at: number; readonly message: Message }
  | { readonly kind: 'drop'; readonly at: number; readonly message: Message; readonly reason: DropReason }
  | {
      readonly kind: 'deliver';
      readonly at: number;
      readonly message: Message;
      /** Ops the recipient had not seen before. Always empty for requests. */
      readonly applied: readonly Operation[];
    };

export interface DeviceSpec {
  readonly id: NodeId;
  /** How far this device's clock is from true time, in ms. */
  readonly clockSkewMs?: number;
}

export interface SimulationOptions {
  readonly seed: number;
  readonly devices: readonly DeviceSpec[];
  readonly network?: Partial<NetworkConditions>;
  /** How register fields resolve concurrent writes on every device. */
  readonly registers?: RegisterStrategy;
}

export interface SettleResult {
  readonly converged: boolean;
  readonly rounds: number;
}

/**
 * A deterministic, virtual-time world of devices syncing over an unreliable
 * network. Nothing happens until `advance` moves time forward, and every random
 * choice comes from the seed, so the same seed and the same calls always
 * produce the same event log.
 *
 * Sync is pull-based: a device sends its version vector, and the peer replies
 * with every op the vector does not cover. Lost requests or responses are
 * harmless; the next round asks again.
 */
export class Simulation {
  readonly events: SimEvent[] = [];
  readonly #rng: Rng;
  #conditions: NetworkConditions;
  #now = 0;
  #nextMessageId = 1;
  readonly #replicas = new Map<NodeId, Replica>();
  readonly #offline = new Set<NodeId>();
  /** Partition group per device. Empty map means everyone can reach everyone. */
  #groups = new Map<NodeId, number>();
  /** Messages in flight, ordered by delivery time, then by id. */
  #queue: Message[] = [];

  constructor(options: SimulationOptions) {
    this.#rng = createRng(options.seed);
    this.#conditions = validated({ ...PERFECT_NETWORK, ...options.network });
    const replicaOptions = { registers: options.registers };
    for (const { id, clockSkewMs = 0 } of options.devices) {
      if (this.#replicas.has(id)) throw new Error(`Duplicate device id: ${id}`);
      this.#replicas.set(id, new Replica(id, () => this.#now + clockSkewMs, replicaOptions));
    }
  }

  get now(): number {
    return this.#now;
  }

  get conditions(): NetworkConditions {
    return this.#conditions;
  }

  nodes(): NodeId[] {
    return [...this.#replicas.keys()];
  }

  replica(node: NodeId): Replica {
    const replica = this.#replicas.get(node);
    if (!replica) throw new Error(`Unknown device: ${node}`);
    return replica;
  }

  inFlight(): readonly Message[] {
    return this.#queue;
  }

  edit(node: NodeId, record: RecordId, field: FieldName, value: FieldValue): Operation {
    return this.#logEdit(this.replica(node).set(record, field, value));
  }

  /** Re-read every device's history under a different register strategy. */
  setRegisterStrategy(strategy: RegisterStrategy): void {
    for (const replica of this.#replicas.values()) replica.setRegisterStrategy(strategy);
  }

  setConditions(patch: Partial<NetworkConditions>): void {
    this.#conditions = validated({ ...this.#conditions, ...patch });
  }

  setOnline(node: NodeId, online: boolean): void {
    this.replica(node);
    if (online) this.#offline.delete(node);
    else this.#offline.add(node);
  }

  isOnline(node: NodeId): boolean {
    return !this.#offline.has(node);
  }

  /** Split devices into groups that cannot reach each other. Unlisted devices are cut off from everyone. */
  partition(groups: readonly (readonly NodeId[])[]): void {
    const assignment = new Map<NodeId, number>();
    groups.forEach((group, index) => {
      for (const node of group) {
        this.replica(node);
        if (assignment.has(node)) throw new Error(`Device ${node} is in more than one group`);
        assignment.set(node, index);
      }
    });
    let isolated = groups.length;
    for (const node of this.#replicas.keys()) {
      if (!assignment.has(node)) assignment.set(node, isolated++);
    }
    this.#groups = assignment;
  }

  heal(): void {
    this.#groups = new Map();
  }

  /** `requester` asks `peer` for the ops it is missing. */
  requestSync(requester: NodeId, peer: NodeId): void {
    this.#send(requester, peer, {
      kind: 'sync-request',
      known: this.replica(requester).versionVector(),
    });
  }

  /** Every online device asks every other device for what it is missing. */
  gossip(): void {
    for (const requester of this.#replicas.keys()) {
      if (!this.isOnline(requester)) continue;
      for (const peer of this.#replicas.keys()) {
        if (peer !== requester) this.requestSync(requester, peer);
      }
    }
  }

  /** Move virtual time forward, delivering every message due on the way. */
  advance(ms: number): void {
    if (ms < 0) throw new RangeError('Cannot move time backwards');
    const until = this.#now + ms;
    let next = this.#queue[0];
    while (next && next.deliverAt <= until) {
      this.#queue.shift();
      this.#now = next.deliverAt;
      this.#deliver(next);
      next = this.#queue[0];
    }
    this.#now = until;
  }

  /** True when every device holds exactly the same set of ops. */
  converged(): boolean {
    const [first, ...rest] = [...this.#replicas.values()].map(fingerprint);
    return rest.every((f) => f === first);
  }

  /**
   * Gossip until every device agrees and nothing is in flight, or give up after
   * `maxRounds`. Each round waits long enough for a request and its response.
   */
  settle(maxRounds = 100): SettleResult {
    for (let rounds = 0; rounds <= maxRounds; rounds++) {
      if (this.#queue.length === 0 && this.converged()) return { converged: true, rounds };
      if (rounds === maxRounds) break;
      this.gossip();
      this.advance(2 * this.#conditions.maxLatencyMs + 1);
    }
    return { converged: false, rounds: maxRounds };
  }

  #canReach(from: NodeId, to: NodeId): DropReason | undefined {
    if (!this.isOnline(from) || !this.isOnline(to)) return 'offline';
    if (this.#groups.size > 0 && this.#groups.get(from) !== this.#groups.get(to)) return 'partitioned';
    return undefined;
  }

  #send(from: NodeId, to: NodeId, payload: Payload): void {
    const message: Message = {
      id: this.#nextMessageId++,
      from,
      to,
      sentAt: this.#now,
      deliverAt: this.#now,
      payload,
      duplicate: false,
    };
    const blocked = this.#canReach(from, to);
    if (blocked) {
      this.events.push({ kind: 'drop', at: this.#now, message, reason: blocked });
      return;
    }
    this.events.push({ kind: 'send', at: this.#now, message });
    if (this.#rng.chance(this.#conditions.dropRate)) {
      this.events.push({ kind: 'drop', at: this.#now, message, reason: 'lost' });
      return;
    }
    this.#enqueue({ ...message, deliverAt: this.#now + this.#latency() });
    if (this.#rng.chance(this.#conditions.duplicateRate)) {
      const copy: Message = {
        ...message,
        id: this.#nextMessageId++,
        deliverAt: this.#now + this.#latency(),
        duplicate: true,
      };
      this.events.push({ kind: 'send', at: this.#now, message: copy });
      this.#enqueue(copy);
    }
  }

  #deliver(message: Message): void {
    // The link may have gone down while the message was in the air.
    const blocked = this.#canReach(message.from, message.to);
    if (blocked) {
      this.events.push({ kind: 'drop', at: this.#now, message, reason: blocked });
      return;
    }
    const recipient = this.replica(message.to);
    if (message.payload.kind === 'sync-request') {
      this.events.push({ kind: 'deliver', at: this.#now, message, applied: [] });
      this.#send(message.to, message.from, {
        kind: 'sync-response',
        ops: recipient.missingFor(message.payload.known),
      });
    } else {
      const applied = recipient.receive(message.payload.ops);
      this.events.push({ kind: 'deliver', at: this.#now, message, applied });
    }
  }

  #logEdit(op: Operation): Operation {
    this.events.push({ kind: 'edit', at: this.#now, op });
    return op;
  }

  #latency(): number {
    return this.#rng.int(this.#conditions.minLatencyMs, this.#conditions.maxLatencyMs);
  }

  #enqueue(message: Message): void {
    const index = this.#queue.findIndex(
      (m) => m.deliverAt > message.deliverAt || (m.deliverAt === message.deliverAt && m.id > message.id),
    );
    if (index === -1) this.#queue.push(message);
    else this.#queue.splice(index, 0, message);
  }
}

function validated(conditions: NetworkConditions): NetworkConditions {
  const { minLatencyMs, maxLatencyMs, dropRate, duplicateRate } = conditions;
  if (!(minLatencyMs >= 0 && maxLatencyMs >= minLatencyMs)) {
    throw new RangeError('Latency must satisfy 0 <= min <= max');
  }
  if (!(dropRate >= 0 && dropRate <= 1 && duplicateRate >= 0 && duplicateRate <= 1)) {
    throw new RangeError('Drop and duplicate rates must be between 0 and 1');
  }
  return conditions;
}

/**
 * The ids of every op a replica holds. State is a pure function of the op set,
 * so equal fingerprints mean equal state.
 */
function fingerprint(replica: Replica): string {
  return replica
    .missingFor({})
    .map((op) => op.id)
    .sort()
    .join(',');
}
