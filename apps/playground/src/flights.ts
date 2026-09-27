import type { Message, SimEvent } from '@syncsim/engine'

/** What became of a message, and when. */
export type Outcome =
  | { readonly kind: 'delivered'; readonly at: number; readonly applied: number }
  | { readonly kind: 'dropped'; readonly at: number }
  | { readonly kind: 'in-flight' }

export interface Flight {
  readonly message: Message
  readonly outcome: Outcome
}

export type EditEvent = Extract<SimEvent, { kind: 'edit' }>
export type DropEvent = Extract<SimEvent, { kind: 'drop' }>

export interface Traffic {
  /** Every message sent since `since`, with its outcome. */
  readonly flights: readonly Flight[]
  /** Messages refused before they left: the sender was offline, or the link was partitioned. */
  readonly blocked: readonly DropEvent[]
  readonly edits: readonly EditEvent[]
}

/**
 * Walk the event log backwards until `since`, pairing each sent message with what
 * became of it. Every list comes back oldest first.
 */
export function collectTraffic(events: readonly SimEvent[], since: number, now: number): Traffic {
  const sent = new Map<number, Message>()
  const outcomes = new Map<number, Outcome>()
  const blocked: DropEvent[] = []
  const edits: EditEvent[] = []
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!
    if (e.at < since) break
    if (e.kind === 'edit') edits.push(e)
    else if (e.kind === 'send') sent.set(e.message.id, e.message)
    else if (e.kind === 'deliver') outcomes.set(e.message.id, { kind: 'delivered', at: e.at, applied: e.applied.length })
    else if (e.reason === 'lost' || e.message.deliverAt > e.message.sentAt) {
      // Lost in transit, or its link went down while it was in the air.
      outcomes.set(e.message.id, { kind: 'dropped', at: e.at })
    } else {
      blocked.push(e)
    }
  }
  const flights = [...sent.values()].reverse().map(
    (message): Flight => ({
      message,
      outcome:
        outcomes.get(message.id) ??
        (message.deliverAt > now ? { kind: 'in-flight' } : { kind: 'dropped', at: message.deliverAt }),
    }),
  )
  return { flights, blocked: blocked.reverse(), edits: edits.reverse() }
}
