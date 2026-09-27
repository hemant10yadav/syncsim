import type { NodeId } from './types';

/**
 * Hybrid logical clock timestamp (Kulkarni et al., 2014).
 *
 * `wall` stays close to physical time, `counter` orders events that share a
 * `wall` value, and `node` breaks the remaining ties so that every pair of
 * timestamps is strictly ordered.
 */
export interface Timestamp {
  readonly wall: number;
  readonly counter: number;
  readonly node: NodeId;
}

export function compareTimestamps(a: Timestamp, b: Timestamp): number {
  if (a.wall !== b.wall) return a.wall - b.wall;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
}

/**
 * Issues timestamps that never go backwards, even when the device clock does,
 * and that always sort after any timestamp this node has already seen.
 * The second property is what lets a later edit win over an earlier one made
 * on a device whose clock runs ahead.
 */
export class HybridClock {
  readonly node: NodeId;
  readonly #physicalNow: () => number;
  #wall = 0;
  #counter = 0;

  constructor(node: NodeId, physicalNow: () => number) {
    this.node = node;
    this.#physicalNow = physicalNow;
  }

  /** Timestamp for a local event. */
  now(): Timestamp {
    const physical = this.#physicalNow();
    if (physical > this.#wall) {
      this.#wall = physical;
      this.#counter = 0;
    } else {
      this.#counter++;
    }
    return this.#current();
  }

  /** Advance past a timestamp received from another node. */
  receive(remote: Timestamp): void {
    const physical = this.#physicalNow();
    const wall = Math.max(this.#wall, remote.wall, physical);
    if (wall === this.#wall && wall === remote.wall) {
      this.#counter = Math.max(this.#counter, remote.counter) + 1;
    } else if (wall === this.#wall) {
      this.#counter++;
    } else if (wall === remote.wall) {
      this.#counter = remote.counter + 1;
    } else {
      this.#counter = 0;
    }
    this.#wall = wall;
  }

  #current(): Timestamp {
    return { wall: this.#wall, counter: this.#counter, node: this.node };
  }
}
