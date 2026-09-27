import type { NetworkConditions, RegisterStrategy, Simulation } from '@syncsim/engine'
import { CASE, type FieldMode } from './world'

const HOUR = 3_600_000

/** What a step may do: drive the simulation, or change how the UI reads it. */
export interface ScenarioContext {
  readonly sim: Simulation
  setStrategy(strategy: RegisterStrategy): void
}

export interface ScenarioStep {
  /** What the viewer should notice after this step. */
  readonly caption: string
  readonly run?: (ctx: ScenarioContext) => void
}

export interface Scenario {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly seed: number
  readonly mode: FieldMode
  readonly strategy: RegisterStrategy
  readonly network: NetworkConditions
  /** The first step is shown as soon as the scenario starts. */
  readonly steps: readonly ScenarioStep[]
}

/** Virtual ms after a step before the next one makes sense: one full request/response round. */
export const STEP_SETTLE_MS = 2_000

/** Lossless, so scenarios play out the same way every time and match their captions. */
const CALM_NETWORK: NetworkConditions = { minLatencyMs: 300, maxLatencyMs: 800, dropRate: 0, duplicateRate: 0 }

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'concurrent-edits',
    title: 'Two health workers edit the same case',
    summary: 'Two phones change the status while offline. Who wins, and does anyone notice?',
    seed: 101,
    mode: 'crdt',
    strategy: 'lww-hlc',
    network: CALM_NETWORK,
    steps: [
      { caption: 'All three phones agree: the case is open. Merge strategy: logical clock wins.' },
      {
        caption: 'Phones A and B lose signal.',
        run: ({ sim }) => {
          sim.setOnline('A', false)
          sim.setOnline('B', false)
        },
      },
      {
        caption: 'On Phone A, a worker marks the case visited.',
        run: ({ sim }) => {
          sim.edit('A', CASE, 'status', 'visited')
        },
      },
      {
        caption: 'A moment later on Phone B, another worker marks it referred.',
        run: ({ sim }) => {
          sim.advance(500)
          sim.edit('B', CASE, 'status', 'referred')
        },
      },
      {
        caption: 'Signal returns and the phones sync. B’s edit was later, so it wins. A’s “visited” is gone, and nobody was told. Tap “why?” next to Status to see it.',
        run: ({ sim }) => {
          sim.setOnline('A', true)
          sim.setOnline('B', true)
          sim.gossip()
        },
      },
      {
        caption: 'Switch to “Keep conflicts”. The same history now shows both edits as a conflict on every phone.',
        run: ({ setStrategy }) => setStrategy('multi-value'),
      },
      {
        caption: 'A supervisor on Phone C keeps “visited”. That write replaces both versions, and the conflict clears everywhere.',
        run: ({ sim }) => {
          sim.edit('C', CASE, 'status', 'visited')
          sim.gossip()
        },
      },
    ],
  },
  {
    id: 'clock-liar',
    title: 'The clock liar',
    summary: 'A phone whose clock runs an hour fast keeps overwriting newer edits.',
    seed: 202,
    mode: 'crdt',
    strategy: 'lww-wall',
    network: CALM_NETWORK,
    steps: [
      { caption: 'Merge strategy: device clock wins. Phone A’s clock is about to go wrong.' },
      {
        caption: 'Phone A’s clock now runs 1 hour fast.',
        run: ({ sim }) => sim.setClockSkew('A', HOUR),
      },
      {
        caption: 'Phone A marks the case visited, and every phone syncs it.',
        run: ({ sim }) => {
          sim.edit('A', CASE, 'status', 'visited')
          sim.gossip()
        },
      },
      {
        caption: 'Phone B has seen “visited” and corrects it to closed. After syncing, A’s older edit still wins, because its clock claims to be later.',
        run: ({ sim }) => {
          sim.edit('B', CASE, 'status', 'closed')
          sim.gossip()
        },
      },
      {
        caption: 'Switch to “logical clock wins”. B had seen A’s edit before correcting it, so B’s correction wins, whatever the clocks say.',
        run: ({ setStrategy }) => setStrategy('lww-hlc'),
      },
    ],
  },
  {
    id: 'lost-visits',
    title: 'Offline visits get lost',
    summary: 'Two workers each record a visit offline. With plain values, one visit disappears.',
    seed: 303,
    mode: 'plain',
    strategy: 'lww-hlc',
    network: CALM_NETWORK,
    steps: [
      { caption: 'Visits is a plain value here: the app reads it, adds one, and writes it back. The case has 1 visit.' },
      {
        caption: 'Phones A and B lose signal.',
        run: ({ sim }) => {
          sim.setOnline('A', false)
          sim.setOnline('B', false)
        },
      },
      {
        caption: 'Each worker records a visit. Both phones now show 2.',
        run: ({ sim }) => {
          sim.increment('A', CASE, 'visits')
          sim.advance(200)
          sim.increment('B', CASE, 'visits')
        },
      },
      {
        caption: 'Signal returns and the phones sync. Two visits happened, but the case says 2, not 3: both phones wrote “2”, and one write replaced the other.',
        run: ({ sim }) => {
          sim.setOnline('A', true)
          sim.setOnline('B', true)
          sim.gossip()
        },
      },
      {
        caption: 'Run “Counters keep every visit” to see the same steps with a CRDT counter.',
      },
    ],
  },
  {
    id: 'counted-visits',
    title: 'Counters keep every visit',
    summary: 'The same offline visits, with visits as a CRDT counter.',
    seed: 303,
    mode: 'crdt',
    strategy: 'lww-hlc',
    network: CALM_NETWORK,
    steps: [
      { caption: 'Visits is a counter here: each visit is its own increment. The case has 1 visit.' },
      {
        caption: 'Phones A and B lose signal, and each worker records a visit.',
        run: ({ sim }) => {
          sim.setOnline('A', false)
          sim.setOnline('B', false)
          sim.increment('A', CASE, 'visits')
          sim.advance(200)
          sim.increment('B', CASE, 'visits')
        },
      },
      {
        caption: 'Signal returns and the phones sync. Every phone shows 3: both increments survive.',
        run: ({ sim }) => {
          sim.setOnline('A', true)
          sim.setOnline('B', true)
          sim.gossip()
        },
      },
    ],
  },
  {
    id: 'duplicate-delivery',
    title: 'Duplicate delivery',
    summary: 'Every message arrives twice. Does anything get counted twice?',
    seed: 404,
    mode: 'crdt',
    strategy: 'lww-hlc',
    network: { ...CALM_NETWORK, duplicateRate: 1 },
    steps: [
      { caption: 'The network now delivers every message twice. Watch the dotted lines on the timeline.' },
      {
        caption: 'Phone A records a visit, and the phones sync.',
        run: ({ sim }) => {
          sim.increment('A', CASE, 'visits')
          sim.gossip()
        },
      },
      {
        caption: 'Every phone received the visit at least twice but shows 2, not 3. Each edit has a unique id, and a phone ignores an id it already holds.',
      },
    ],
  },
]

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
