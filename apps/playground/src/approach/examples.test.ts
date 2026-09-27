import { describe, expect, it } from 'vitest'
import {
  clockExample,
  counterExample,
  deliverShuffled,
  keyIdeaWrites,
  problemSteps,
  setExample,
  strategyHistories,
} from './examples'

// Each test pins a claim the approach page makes in words, so the text cannot
// drift from what the engine does.

describe('approach page examples', () => {
  it('the problem: one offline edit silently disappears', () => {
    const steps = problemSteps()
    const last = steps.at(-1)!
    expect(steps[0]).toMatchObject({ a: 'open', b: 'open', online: true })
    expect(steps[2]).toMatchObject({ a: 'visited', b: 'open' })
    expect(steps[3]).toMatchObject({ a: 'visited', b: 'referred' })
    expect(last).toMatchObject({ a: 'referred', b: 'referred', online: true, lost: { value: 'visited', by: 'A' } })
  })

  it('clocks: a fast clock wins under wall-clock time, the correction wins under HLC', () => {
    const ex = clockExample()
    // A's edit came first but its clock reads an hour ahead of B's later edit.
    expect(ex.first.deviceTime).toBeGreaterThan(ex.second.deviceTime)
    // B had seen A's edit, so B's logical timestamp moved past it.
    expect(ex.second.ts.wall).toBe(ex.first.ts.wall)
    expect(ex.second.ts.counter).toBeGreaterThan(ex.first.ts.counter)
    expect(ex.winners).toEqual({ 'lww-wall': 'visited', 'lww-hlc': 'closed' })
  })

  it('key idea: each write lists exactly what it replaced', () => {
    const [open, visited, referred, resolution] = keyIdeaWrites(true)
    expect(open!.op.change.supersedes).toEqual([])
    expect(visited!.op.change.supersedes).toEqual([open!.op.id])
    expect(referred!.op.change.supersedes).toEqual([open!.op.id])
    expect([...resolution!.op.change.supersedes].sort()).toEqual([visited!.op.id, referred!.op.id].sort())
  })

  it('key idea: arrival order never changes what is standing', () => {
    for (const withResolution of [false, true]) {
      const writes = keyIdeaWrites(withResolution)
      const expected = withResolution ? ['visited'] : ['referred', 'visited']
      const orders = new Set<string>()
      for (let seed = 1; seed <= 50; seed++) {
        const d = deliverShuffled(writes, seed)
        orders.add(d.order.join())
        expect(d.standing).toEqual(expected)
      }
      // The shuffle really does produce different orders.
      expect(orders.size).toBeGreaterThan(1)
    }
  })

  it('strategies: what each one shows and loses on the two histories', () => {
    const [concurrent, correction] = strategyHistories()
    expect(concurrent!.outcomes).toEqual({
      'lww-wall': { shown: ['referred'], lost: ['visited'] },
      'lww-hlc': { shown: ['referred'], lost: ['visited'] },
      'multi-value': { shown: ['referred', 'visited'], lost: [] },
    })
    expect(correction!.outcomes).toEqual({
      'lww-wall': { shown: ['visited'], lost: ['closed'] },
      'lww-hlc': { shown: ['closed'], lost: [] },
      'multi-value': { shown: ['closed'], lost: [] },
    })
  })

  it('counter: two offline visits count as two, a plain value counts one', () => {
    expect(counterExample()).toEqual({ start: 1, plain: 2, counter: 3 })
  })

  it('set: an add the remover never saw survives', () => {
    expect(setExample()).toEqual({ plain: [], set: ['urgent'] })
  })
})
