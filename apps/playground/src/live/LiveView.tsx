import { REGISTER_STRATEGIES, type NodeId, type RegisterStrategy } from '@syncsim/engine'
import { useState } from 'react'
import { Phone } from '../components/Phone'
import { Segmented } from '../components/Segmented'
import { STRATEGY_INFO } from '../labels'
import { CASE } from '../world'
import { useLiveSession } from './useLiveSession'

/** This browser tab as a real device, syncing with the site's other open tabs. */
export function LiveView() {
  const session = useLiveSession()
  const [strategy, setStrategy] = useState<RegisterStrategy>(() => session?.replica.registerStrategy ?? 'lww-hlc')

  if (!session) {
    return <p className="notice">This browser does not support BroadcastChannel, so tabs cannot talk to each other.</p>
  }

  const chooseStrategy = (next: RegisterStrategy) => {
    session.replica.setRegisterStrategy(next)
    setStrategy(next)
  }

  const peers = session.peers()
  const labelFor = (node: NodeId) => (node === session.id ? 'this tab' : node)

  return (
    <div className="live">
      <section className="live__intro" aria-label="How the live demo works">
        <h2 className="live__title">Live tabs</h2>
        <p>
          Each open tab of this page is a real device with its own copy of the case. Tabs sync through the
          browser’s BroadcastChannel using the same protocol as the simulator: a tab pulls what it is missing every
          2 s, and pushes its own edits straight away. Nothing leaves your browser.
        </p>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => window.open(window.location.href, '_blank')}>
            Open another tab
          </button>
          <span className="muted">
            {peers.length === 0
              ? 'No other tabs yet.'
              : `Connected to ${peers.length} other ${peers.length === 1 ? 'tab' : 'tabs'}: ${peers.join(', ')}`}
          </span>
        </div>
        <p className="group__note">
          Try it: take one tab offline, edit the status in both, then bring it back. The merge strategy only changes
          how this tab reads the history, so two tabs can compare strategies on the same edits.
        </p>
        <Segmented
          label="Merge strategy"
          options={REGISTER_STRATEGIES.map((s) => ({ value: s, label: STRATEGY_INFO[s].label }))}
          value={strategy}
          onChange={chooseStrategy}
        />
      </section>

      <div className="live__phone">
        <Phone
          view={{
            title: `This tab (${session.id})`,
            replica: session.replica,
            online: session.online,
            detail: `${peers.length} ${peers.length === 1 ? 'peer' : 'peers'}`,
            labelFor,
          }}
          actions={{
            setOnline: (online) => session.setOnline(online),
            set: (field, value) => session.edit((r) => r.set(CASE, field, value)),
            increment: (field) => session.edit((r) => r.increment(CASE, field)),
            addElement: (field, element) => session.edit((r) => r.addElement(CASE, field, element)),
            removeElement: (field, element) => session.edit((r) => r.removeElement(CASE, field, element)),
          }}
        />
      </div>
    </div>
  )
}
