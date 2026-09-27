import type { NodeId, Simulation } from '@syncsim/engine'
import { describe, expect, it } from 'vitest'
import { SCENARIOS, STEP_SETTLE_MS, type Scenario } from './scenarios'
import { CASE, createWorld, DEVICES } from './world'

/** Play a scenario without the UI, pausing after each step as long as a viewer would. */
function* play(scenario: Scenario): Generator<Simulation> {
  const sim = createWorld({ seed: scenario.seed, mode: scenario.mode }, scenario.strategy, scenario.network)
  const ctx = { sim, setStrategy: (s: Parameters<Simulation['setRegisterStrategy']>[0]) => sim.setRegisterStrategy(s) }
  for (const step of scenario.steps) {
    step.run?.(ctx)
    sim.advance(STEP_SETTLE_MS)
    yield sim
  }
}

const ids = DEVICES.map((d) => d.id)
const on = (sim: Simulation, id: NodeId, field: string) => sim.replica(id).value(CASE, field)
const everywhere = (sim: Simulation, field: string) => ids.map((id) => on(sim, id, field))
const conflictCounts = (sim: Simulation) => ids.map((id) => sim.replica(id).conflicts().length)

/** Step through a scenario by id; each call runs the next step and returns the simulation. */
function stepper(id: string): () => Simulation {
  const scenario = SCENARIOS.find((s) => s.id === id)
  if (!scenario) throw new Error(`No scenario ${id}`)
  const run = play(scenario)
  return () => {
    const next = run.next()
    if (next.done) throw new Error(`Scenario ${id} has no more steps`)
    return next.value
  }
}

describe('scenarios do what their captions say', () => {
  it('has unique ids and at least two steps each', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
    for (const s of SCENARIOS) expect(s.steps.length).toBeGreaterThanOrEqual(2)
  })

  it('two health workers: LWW silently keeps B, multi-value shows the conflict, C resolves it', () => {
    const at = stepper('concurrent-edits')

    expect(everywhere(at(), 'status')).toEqual(['open', 'open', 'open'])
    at() // offline
    expect(on(at(), 'A', 'status')).toBe('visited')
    let sim = at()
    expect(on(sim, 'B', 'status')).toBe('referred')
    expect(sim.converged()).toBe(false)

    sim = at() // sync under lww-hlc
    expect(sim.converged()).toBe(true)
    expect(everywhere(sim, 'status')).toEqual(['referred', 'referred', 'referred'])
    expect(conflictCounts(sim)).toEqual([0, 0, 0])

    sim = at() // multi-value
    expect(conflictCounts(sim)).toEqual([1, 1, 1])

    sim = at() // C resolves
    expect(sim.converged()).toBe(true)
    expect(conflictCounts(sim)).toEqual([0, 0, 0])
    expect(everywhere(sim, 'status')).toEqual(['visited', 'visited', 'visited'])
  })

  it('clock liar: device clock keeps A’s stale edit, logical clock keeps B’s correction', () => {
    const at = stepper('clock-liar')
    at()
    at() // skew
    expect(everywhere(at(), 'status')).toEqual(['visited', 'visited', 'visited'])
    let sim = at() // B corrects, device clock wins
    expect(sim.converged()).toBe(true)
    expect(everywhere(sim, 'status')).toEqual(['visited', 'visited', 'visited'])
    sim = at() // logical clock
    expect(everywhere(sim, 'status')).toEqual(['closed', 'closed', 'closed'])
  })

  it('offline visits with plain values: two visits, but the count only goes to 2', () => {
    const at = stepper('lost-visits')
    expect(everywhere(at(), 'visits')).toEqual([1, 1, 1])
    at()
    let sim = at()
    expect([on(sim, 'A', 'visits'), on(sim, 'B', 'visits')]).toEqual([2, 2])
    sim = at()
    expect(sim.converged()).toBe(true)
    expect(everywhere(sim, 'visits')).toEqual([2, 2, 2])
  })

  it('offline visits with a counter: both visits count', () => {
    const at = stepper('counted-visits')
    expect(everywhere(at(), 'visits')).toEqual([1, 1, 1])
    at()
    const sim = at()
    expect(sim.converged()).toBe(true)
    expect(everywhere(sim, 'visits')).toEqual([3, 3, 3])
  })

  it('duplicate delivery: messages arrive twice, the visit counts once', () => {
    const at = stepper('duplicate-delivery')
    at()
    const sim = at()
    expect(sim.converged()).toBe(true)
    expect(everywhere(sim, 'visits')).toEqual([2, 2, 2])
    const duplicates = sim.events.filter((e) => e.kind === 'deliver' && e.message.duplicate)
    expect(duplicates.length).toBeGreaterThan(0)
  })
})
