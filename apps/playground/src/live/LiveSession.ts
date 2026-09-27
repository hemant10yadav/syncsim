import { Replica, type NodeId, type Operation, type RegisterStrategy, type Schema, type VersionVector } from '@syncsim/engine'

/** The subset of BroadcastChannel the session uses, so tests can pass an in-memory bus. */
export interface ChannelLike {
  postMessage(message: WireMessage): void
  onmessage: ((event: { data: WireMessage }) => void) | null
  close(): void
}

/**
 * The same pull protocol the simulator uses, plus a push for fresh edits so
 * other tabs update without waiting for the next pull.
 */
export type WireMessage =
  | { readonly type: 'pull'; readonly from: NodeId; readonly known: VersionVector }
  | { readonly type: 'ops'; readonly from: NodeId; readonly to?: NodeId; readonly ops: readonly Operation[] }

export interface LiveSessionOptions {
  readonly id: NodeId
  /** Called by `start`; a stopped session can be started again with a fresh channel. */
  readonly openChannel: () => ChannelLike
  readonly schema?: Schema
  readonly registers?: RegisterStrategy
  readonly now?: () => number
}

/** A peer is shown as present if it has sent anything this recently. */
export const PEER_TIMEOUT_MS = 6_000

/**
 * One browser tab's replica, synced with other tabs of the same origin over a
 * BroadcastChannel. Every message goes to every tab; replies carry `to` so only
 * the tab that asked applies them (applying them anyway would be harmless,
 * since receiving an op twice changes nothing).
 *
 * "Offline" drops traffic in both directions, like the simulator's devices.
 * Nothing is sent or received until `start`.
 */
export class LiveSession {
  readonly id: NodeId
  readonly replica: Replica
  readonly #openChannel: () => ChannelLike
  #channel: ChannelLike | null = null
  readonly #now: () => number
  readonly #lastSeen = new Map<NodeId, number>()
  readonly #listeners = new Set<() => void>()
  #online = true

  constructor({ id, openChannel, schema, registers, now = Date.now }: LiveSessionOptions) {
    this.id = id
    this.#openChannel = openChannel
    this.#now = now
    this.replica = new Replica(id, now, { schema, registers })
  }

  /** Join the channel and ask peers for anything missed. Returns `stop`. */
  start(): () => void {
    if (!this.#channel) {
      const channel = this.#openChannel()
      channel.onmessage = (event) => this.#handle(event.data)
      this.#channel = channel
      this.pull()
    }
    return () => this.stop()
  }

  stop(): void {
    if (!this.#channel) return
    this.#channel.onmessage = null
    this.#channel.close()
    this.#channel = null
  }

  get online(): boolean {
    return this.#online
  }

  setOnline(online: boolean): void {
    this.#online = online
    if (online) this.pull()
    this.#changed()
  }

  /** Tabs heard from within PEER_TIMEOUT_MS, most recent first. */
  peers(): NodeId[] {
    const cutoff = this.#now() - PEER_TIMEOUT_MS
    return [...this.#lastSeen]
      .filter(([, at]) => at >= cutoff)
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id)
  }

  /** Ask every other tab for whatever this tab is missing. Also serves as a heartbeat. */
  pull(): void {
    this.#send({ type: 'pull', from: this.id, known: this.replica.versionVector() })
  }

  /** Apply a local edit and push it to the other tabs straight away. */
  edit(change: (replica: Replica) => Operation): Operation {
    const op = change(this.replica)
    this.#send({ type: 'ops', from: this.id, ops: [op] })
    this.#changed()
    return op
  }

  /** Re-render hook: called after anything visible changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #send(message: WireMessage): void {
    if (this.#online) this.#channel?.postMessage(message)
  }

  #handle(message: WireMessage): void {
    if (!this.#online || message.from === this.id) return
    this.#lastSeen.set(message.from, this.#now())
    if (message.type === 'pull') {
      const missing = this.replica.missingFor(message.known)
      if (missing.length > 0) this.#send({ type: 'ops', from: this.id, to: message.from, ops: missing })
    } else if (message.to === undefined || message.to === this.id) {
      this.replica.receive(message.ops)
    }
    this.#changed()
  }

  #changed(): void {
    for (const listener of this.#listeners) listener()
  }
}
