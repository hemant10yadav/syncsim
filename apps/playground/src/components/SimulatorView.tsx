import type { NodeId, Simulation } from '@syncsim/engine'
import { useEffect } from 'react'
import { useSimulation } from '../useSimulation'
import { CASE, deviceLabel, DEVICES, seedFromUrl, writeSeedToUrl } from '../world'
import { Controls } from './Controls'
import { NetworkView } from './NetworkView'
import { Phone, type PhoneActions, type PhoneView } from './Phone'
import { ScenarioPanel } from './ScenarioPanel'
import { StrategyComparison } from './StrategyComparison'
import { Timeline } from './Timeline'

/** Three simulated phones on a simulated network, with scenarios, a live network view, controls and a timeline. */
export function SimulatorView() {
  const controls = useSimulation({ seed: seedFromUrl(), mode: 'crdt' })
  const { sim, setup, act } = controls

  // Keep the seed in the URL so a run can be shared and replayed.
  useEffect(() => writeSeedToUrl(setup.seed), [setup.seed])

  const inSync = sim.converged()
  // Every phone reports the same conflicts once in sync, so one phone's count is the count.
  const conflicts = sim.replica(DEVICES[0]!.id).conflicts().length

  return (
    <>
      <div className="statusbar">
        <span className={`pill ${inSync ? 'pill--ok' : 'pill--warn'}`} role="status">
          {inSync ? 'All phones in sync' : 'Phones out of sync'}
        </span>
        {inSync && conflicts > 0 && (
          <span className="pill pill--warn">
            {conflicts} open {conflicts === 1 ? 'conflict' : 'conflicts'}
          </span>
        )}
        <span className="mono muted">
          seed {setup.seed} · t = {(sim.now / 1000).toFixed(1)} s
        </span>
      </div>

      <main className="layout">
        <ScenarioPanel controls={controls} />
        <NetworkView sim={sim} onToggle={(id) => act((s) => s.setOnline(id, !s.isOnline(id)))} />
        <div className="phones">
          {DEVICES.map((d) => {
            const { view, actions } = simulatedPhone(sim, d.id, act)
            return <Phone key={d.id} view={view} actions={actions} />
          })}
        </div>
        <StrategyComparison sim={sim} strategy={controls.strategy} onChoose={controls.setStrategy} />
        <Controls controls={controls} />
        <Timeline sim={sim} />
        <section className="recipes" aria-label="Things to try">
          <h2 className="recipes__title">Things to try</h2>
          <ol>
            <li>
              Take Phone B offline, change the status on A and on B, bring B back. Then flip the merge strategy and
              see which edit survives.
            </li>
            <li>
              Set Phone A’s clock 1 h fast and choose “Device clock wins”. Edit the status on A, wait for a sync,
              then change it on B: A’s older edit still wins.
            </li>
            <li>
              Switch visits and tags to plain values, take two phones offline, and tap +1 visit on each. Only one
              visit survives. With CRDTs, both do.
            </li>
          </ol>
        </section>
      </main>
    </>
  )
}

function simulatedPhone(
  sim: Simulation,
  id: NodeId,
  act: (change: (sim: Simulation) => void) => void,
): { view: PhoneView; actions: PhoneActions } {
  return {
    view: {
      title: deviceLabel(id),
      replica: sim.replica(id),
      online: sim.isOnline(id),
      clockSkew: sim.clockSkew(id),
      labelFor: deviceLabel,
    },
    actions: {
      setOnline: (online) => act((s) => s.setOnline(id, online)),
      setClockSkew: (skewMs) => act((s) => s.setClockSkew(id, skewMs)),
      set: (field, value) => act((s) => s.edit(id, CASE, field, value)),
      increment: (field) => act((s) => s.increment(id, CASE, field)),
      addElement: (field, element) => act((s) => s.addElement(id, CASE, field, element)),
      removeElement: (field, element) => act((s) => s.removeElement(id, CASE, field, element)),
    },
  }
}
