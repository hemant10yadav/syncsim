import { useEffect, useState } from 'react'
import { CASE } from '../world'
import { LiveSession, type ChannelLike, type WireMessage } from './LiveSession'

const CHANNEL = 'syncsim-live'
const PULL_INTERVAL_MS = 2_000
/** How long a new tab waits for peers before deciding it is the first and creating the case. */
const SEED_DELAY_MS = 800

/**
 * This tab's LiveSession, joined to a BroadcastChannel shared by every tab of the
 * site while the component is mounted. Pulls from peers on a timer and
 * re-renders when anything changes. Null when BroadcastChannel is unavailable.
 */
export function useLiveSession(): LiveSession | null {
  const [session] = useState(() =>
    typeof BroadcastChannel === 'undefined'
      ? null
      : new LiveSession({
          id: `tab-${Math.random().toString(16).slice(2, 6)}`,
          openChannel: () => openChannel(CHANNEL),
          schema: { visits: 'counter', tags: 'set' },
          // Start on "Keep conflicts" so edits made while a tab is offline visibly collide.
          registers: 'multi-value',
        }),
  )
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!session) return
    const rerender = () => setVersion((v) => v + 1)
    const unsubscribe = session.subscribe(rerender)
    const stop = session.start()
    const seed = window.setTimeout(() => {
      if (session.replica.read(CASE)) return
      session.edit((r) => r.set(CASE, 'name', 'Asha Devi'))
      session.edit((r) => r.set(CASE, 'status', 'open'))
      session.edit((r) => r.increment(CASE, 'visits'))
      session.edit((r) => r.addElement(CASE, 'tags', 'followup'))
    }, SEED_DELAY_MS)
    const timer = window.setInterval(() => {
      session.pull()
      // Also refreshes the peer list as silent tabs time out.
      rerender()
    }, PULL_INTERVAL_MS)
    return () => {
      window.clearTimeout(seed)
      window.clearInterval(timer)
      unsubscribe()
      stop()
    }
  }, [session])

  return session
}

/** Wrap a real BroadcastChannel in the minimal interface the session needs. */
function openChannel(name: string): ChannelLike {
  const broadcast = new BroadcastChannel(name)
  const channel: ChannelLike = {
    onmessage: null,
    postMessage: (message) => broadcast.postMessage(message),
    close: () => broadcast.close(),
  }
  broadcast.onmessage = (event: MessageEvent<WireMessage>) => channel.onmessage?.({ data: event.data })
  return channel
}
