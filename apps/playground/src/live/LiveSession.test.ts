import { Replica } from '@syncsim/engine'
import { describe, expect, it } from 'vitest'
import { LiveSession, PEER_TIMEOUT_MS, type ChannelLike, type WireMessage } from './LiveSession'

/**
 * An in-memory stand-in for BroadcastChannel: every message reaches every other
 * channel on the bus, asynchronously, like the real thing.
 */
function createBus() {
  const channels = new Set<ChannelLike>()
  let pending = 0
  const bus = {
    channel(): ChannelLike {
      const channel: ChannelLike = {
        onmessage: null,
        postMessage(message: WireMessage) {
          for (const other of channels) {
            if (other === channel) continue
            pending++
            // structuredClone mirrors what BroadcastChannel does to the payload.
            const data = structuredClone(message)
            queueMicrotask(() => {
              pending--
              other.onmessage?.({ data })
            })
          }
        },
        close() {
          channels.delete(channel)
        },
      }
      channels.add(channel)
      return channel
    },
    /** Wait until no message is in flight. */
    async flush() {
      const inFlight = () => pending
      while (inFlight() > 0) await Promise.resolve()
    },
  }
  return bus
}

const schema = { visits: 'counter', tags: 'set' } as const

function tabs(clock = { t: 1_000 }) {
  const bus = createBus()
  const open = (id: string) => {
    const session = new LiveSession({ id, openChannel: () => bus.channel(), schema, now: () => clock.t })
    session.start()
    return session
  }
  return { bus, open, clock }
}

describe('LiveSession', () => {
  it('pushes an edit to the other tab straight away', async () => {
    const { bus, open } = tabs()
    const a = open('tab-a')
    const b = open('tab-b')
    a.edit((r) => r.set('case-1', 'name', 'Asha'))
    await bus.flush()
    expect(b.replica.value('case-1', 'name')).toBe('Asha')
  })

  it('lets a tab opened later catch up by pulling', async () => {
    const { bus, open } = tabs()
    const a = open('tab-a')
    a.edit((r) => r.set('case-1', 'status', 'open'))
    a.edit((r) => r.increment('case-1', 'visits'))
    const late = open('tab-late')
    late.pull()
    await bus.flush()
    expect(late.replica.read('case-1')).toEqual({ status: 'open', visits: 1 })
  })

  it('neither sends nor receives while offline, and catches up on reconnect', async () => {
    const { bus, open } = tabs()
    const a = open('tab-a')
    const b = open('tab-b')
    b.setOnline(false)
    a.edit((r) => r.increment('case-1', 'visits'))
    b.edit((r) => r.increment('case-1', 'visits'))
    await bus.flush()
    expect(a.replica.value('case-1', 'visits')).toBe(1)
    expect(b.replica.value('case-1', 'visits')).toBe(1)

    b.setOnline(true)
    a.pull()
    await bus.flush()
    expect(a.replica.value('case-1', 'visits')).toBe(2)
    expect(b.replica.value('case-1', 'visits')).toBe(2)
  })

  it('only the tab a reply is addressed to applies it', async () => {
    const { bus, open } = tabs()
    // A replica that is not on the bus, so the op can only arrive in the hand-sent reply.
    const op = new Replica('tab-source', () => 0).set('case-1', 'name', 'Asha')
    const b = open('tab-b')
    const c = open('tab-c')
    // A reply to b, sent over the bus by hand so c sees it too.
    bus.channel().postMessage({ type: 'ops', from: 'tab-source', to: 'tab-b', ops: [op] })
    await bus.flush()
    expect(b.replica.value('case-1', 'name')).toBe('Asha')
    expect(c.replica.value('case-1', 'name')).toBeUndefined()
  })

  it('lists peers it has heard from recently', async () => {
    const { bus, open, clock } = tabs()
    const a = open('tab-a')
    const b = open('tab-b')
    b.pull()
    await bus.flush()
    expect(a.peers()).toEqual(['tab-b'])
    clock.t += PEER_TIMEOUT_MS + 1
    expect(a.peers()).toEqual([])
  })

  it('can be stopped and started again, catching up on what it missed', async () => {
    const { bus, open } = tabs()
    const a = open('tab-a')
    const b = open('tab-b')
    b.stop()
    a.edit((r) => r.set('case-1', 'name', 'Asha'))
    await bus.flush()
    expect(b.replica.value('case-1', 'name')).toBeUndefined()
    b.start()
    await bus.flush()
    expect(b.replica.value('case-1', 'name')).toBe('Asha')
  })

  it('notifies subscribers when something visible changes', async () => {
    const { bus, open } = tabs()
    const a = open('tab-a')
    const b = open('tab-b')
    let renders = 0
    const unsubscribe = b.subscribe(() => renders++)
    a.edit((r) => r.set('case-1', 'name', 'Asha'))
    await bus.flush()
    expect(renders).toBeGreaterThan(0)
    unsubscribe()
    const before = renders
    a.edit((r) => r.set('case-1', 'name', 'Asha D.'))
    await bus.flush()
    expect(renders).toBe(before)
  })
})
