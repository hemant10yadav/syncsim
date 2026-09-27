import type { NetworkConditions, RegisterStrategy, Simulation } from '@syncsim/engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Scenario, ScenarioContext } from './scenarios'
import {
  createWorld,
  DEFAULT_NETWORK,
  GOSSIP_INTERVAL_MS,
  PARTITIONS,
  type PartitionId,
  type Setup,
} from './world'

/** Real ms of one frame are capped so a background tab does not jump minutes ahead. */
const MAX_FRAME_MS = 100

export interface ActiveScenario {
  readonly scenario: Scenario
  /** Index of the step whose caption is showing; its action has already run. */
  readonly step: number
}

/**
 * Owns one Simulation and drives it in virtual time: every animation frame
 * advances the clock by the real elapsed time times `speed`, and a gossip round
 * runs every GOSSIP_INTERVAL_MS while auto-sync is on.
 *
 * The Simulation is mutable, so every change goes through `act`, which bumps a
 * counter to re-render.
 */
export function useSimulation(initial: Setup) {
  const [setup, setSetup] = useState(initial)
  const [strategy, setStrategyState] = useState<RegisterStrategy>('lww-hlc')
  const [network, setNetworkState] = useState<NetworkConditions>(DEFAULT_NETWORK)
  const [partition, setPartitionState] = useState<PartitionId>('none')
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [autoSync, setAutoSyncState] = useState(true)
  const [sim, setSim] = useState(() => createWorld(initial, 'lww-hlc', DEFAULT_NETWORK))
  const [active, setActive] = useState<ActiveScenario | null>(null)
  const [, setVersion] = useState(0)
  // Tied to the Simulation it was scheduled for, so a frame of the previous world
  // that runs after a reset cannot push the new world's first sync far into the future.
  const nextGossip = useRef({ sim, at: sim.now + GOSSIP_INTERVAL_MS })

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const act = useCallback(
    (change: (sim: Simulation) => void) => {
      change(sim)
      refresh()
    },
    [sim, refresh],
  )

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (time: number) => {
      // rAF passes the frame's start time, which can be earlier than `last`.
      const elapsed = Math.min(MAX_FRAME_MS, Math.max(0, time - last))
      const target = sim.now + elapsed * speed
      last = Math.max(last, time)
      if (nextGossip.current.sim !== sim) nextGossip.current = { sim, at: sim.now + GOSSIP_INTERVAL_MS }
      if (autoSync) {
        const schedule = nextGossip.current
        while (schedule.at <= target) {
          sim.advance(Math.max(0, schedule.at - sim.now))
          sim.gossip()
          schedule.at += GOSSIP_INTERVAL_MS
        }
      }
      sim.advance(target - sim.now)
      refresh()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [sim, running, speed, autoSync, refresh])

  const reset = useCallback(
    (next: Setup = setup) => {
      setSetup(next)
      setSim(createWorld(next, strategy, network))
      setPartitionState('none')
      if (active) {
        // Leaving a scenario: hand syncing back to the timer.
        setActive(null)
        setAutoSyncState(true)
      }
    },
    [setup, strategy, network, active],
  )

  const setStrategy = useCallback(
    (next: RegisterStrategy) => {
      sim.setRegisterStrategy(next)
      setStrategyState(next)
    },
    [sim],
  )

  const contextFor = useCallback(
    (world: Simulation): ScenarioContext => ({
      sim: world,
      setStrategy: (next) => {
        world.setRegisterStrategy(next)
        setStrategyState(next)
      },
    }),
    [],
  )

  /**
   * Start a scenario from its own seed and settings, with auto-sync off so the
   * steps alone decide when phones sync, and show its first step.
   */
  const startScenario = useCallback(
    (scenario: Scenario) => {
      const next = { seed: scenario.seed, mode: scenario.mode }
      const world = createWorld(next, scenario.strategy, scenario.network)
      scenario.steps[0]?.run?.(contextFor(world))
      setSetup(next)
      setSim(world)
      setStrategyState(scenario.strategy)
      setNetworkState(scenario.network)
      setPartitionState('none')
      setAutoSyncState(false)
      setRunning(true)
      setActive({ scenario, step: 0 })
    },
    [contextFor],
  )

  const nextStep = useCallback(() => {
    if (!active) return
    const step = active.step + 1
    const next = active.scenario.steps[step]
    if (!next) return
    next.run?.(contextFor(sim))
    setActive({ scenario: active.scenario, step })
    refresh()
  }, [active, sim, contextFor, refresh])

  const exitScenario = useCallback(() => {
    setActive(null)
    nextGossip.current = { sim, at: sim.now + GOSSIP_INTERVAL_MS }
    setAutoSyncState(true)
  }, [sim])

  const setNetwork = useCallback(
    (patch: Partial<NetworkConditions>) => {
      const next = { ...network, ...patch }
      sim.setConditions(next)
      setNetworkState(next)
    },
    [sim, network],
  )

  const setPartition = useCallback(
    (next: PartitionId) => {
      const { groups } = PARTITIONS[next]
      if (groups) sim.partition(groups)
      else sim.heal()
      setPartitionState(next)
    },
    [sim],
  )

  const setAutoSync = useCallback(
    (on: boolean) => {
      if (on) nextGossip.current = { sim, at: sim.now + GOSSIP_INTERVAL_MS }
      setAutoSyncState(on)
    },
    [sim],
  )

  return {
    sim,
    setup,
    act,
    reset,
    strategy,
    setStrategy,
    network,
    setNetwork,
    partition,
    setPartition,
    running,
    setRunning,
    speed,
    setSpeed,
    autoSync,
    setAutoSync,
    scenario: active,
    startScenario,
    nextStep,
    exitScenario,
  }
}

export type SimulationControls = ReturnType<typeof useSimulation>
