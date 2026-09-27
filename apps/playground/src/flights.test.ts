import { Simulation, type NetworkConditions } from '@syncsim/engine'
import { describe, expect, it } from 'vitest'
import { collectTraffic } from './flights'

function sim(network: Partial<NetworkConditions> = {}) {
  return new Simulation({
    seed: 1,
    devices: [{ id: 'a' }, { id: 'b' }],
    network: { minLatencyMs: 100, maxLatencyMs: 100, ...network },
  })
}

const traffic = (s: Simulation) => collectTraffic(s.events, 0, s.now)
const outcomes = (s: Simulation) => traffic(s).flights.map((f) => f.outcome)

describe('collectTraffic', () => {
  it('pairs a delivered request and response with when they landed and what they applied', () => {
    const s = sim()
    s.edit('a', 'case-1', 'name', 'Asha')
    s.requestSync('b', 'a')
    s.advance(500)
    expect(outcomes(s)).toEqual([
      { kind: 'delivered', at: 100, applied: 0 },
      { kind: 'delivered', at: 200, applied: 1 },
    ])
    expect(traffic(s).edits).toHaveLength(1)
  })

  it('shows a message still in the air as in flight', () => {
    const s = sim()
    s.requestSync('b', 'a')
    s.advance(50)
    expect(outcomes(s)).toEqual([{ kind: 'in-flight' }])
  })

  it('marks a message lost in transit as dropped when it was sent', () => {
    const s = sim({ dropRate: 1 })
    s.advance(30)
    s.requestSync('b', 'a')
    expect(outcomes(s)).toEqual([{ kind: 'dropped', at: 30 }])
  })

  it('marks a message whose link went down in the air as dropped when it would have landed', () => {
    const s = sim()
    s.requestSync('b', 'a')
    s.advance(50)
    s.setOnline('a', false)
    s.advance(100)
    expect(outcomes(s)).toEqual([{ kind: 'dropped', at: 100 }])
    expect(traffic(s).blocked).toEqual([])
  })

  it('lists a message refused before leaving as blocked, not as a flight', () => {
    const s = sim()
    s.setOnline('b', false)
    s.requestSync('b', 'a')
    const t = traffic(s)
    expect(t.flights).toEqual([])
    expect(t.blocked.map((e) => e.reason)).toEqual(['offline'])
  })

  it('ignores events before the window', () => {
    const s = sim()
    s.requestSync('b', 'a')
    s.advance(1_000)
    expect(collectTraffic(s.events, 500, s.now).flights).toEqual([])
  })
})
