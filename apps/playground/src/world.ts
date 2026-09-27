import {
  Simulation,
  type NetworkConditions,
  type NodeId,
  type RegisterStrategy,
  type Schema,
} from '@syncsim/engine'

export const CASE = 'case-1'

export const DEVICES: readonly { id: NodeId; label: string }[] = [
  { id: 'A', label: 'Phone A' },
  { id: 'B', label: 'Phone B' },
  { id: 'C', label: 'Phone C' },
]

export const deviceLabel = (id: NodeId) => DEVICES.find((d) => d.id === id)?.label ?? id

/** `plain`: visits and tags are ordinary values. `crdt`: a counter and a set. */
export type FieldMode = 'plain' | 'crdt'

export interface Setup {
  readonly seed: number
  readonly mode: FieldMode
}

const SCHEMAS: Record<FieldMode, Schema> = {
  plain: {},
  crdt: { visits: 'counter', tags: 'set' },
}

export const DEFAULT_NETWORK: NetworkConditions = {
  minLatencyMs: 300,
  maxLatencyMs: 1_200,
  dropRate: 0.1,
  duplicateRate: 0.05,
}

/** Virtual ms between automatic gossip rounds. */
export const GOSSIP_INTERVAL_MS = 2_500

export const STATUS_OPTIONS = ['open', 'visited', 'referred', 'closed'] as const
export const TAG_OPTIONS = ['followup', 'urgent', 'home-visit', 'lab-test'] as const

const HOUR = 3_600_000
export const SKEW_OPTIONS = [
  { label: '1 h slow', ms: -HOUR },
  { label: 'on time', ms: 0 },
  { label: '1 h fast', ms: HOUR },
] as const

export const PARTITIONS = {
  none: { label: 'Connected', groups: null },
  'A|BC': { label: 'A | B C', groups: [['A'], ['B', 'C']] },
  'AB|C': { label: 'A B | C', groups: [['A', 'B'], ['C']] },
  'AC|B': { label: 'A C | B', groups: [['A', 'C'], ['B']] },
} as const satisfies Record<string, { label: string; groups: NodeId[][] | null }>

export type PartitionId = keyof typeof PARTITIONS

/** Three phones that already agree on one patient case. */
export function createWorld(setup: Setup, registers: RegisterStrategy, network: NetworkConditions): Simulation {
  const sim = new Simulation({
    seed: setup.seed,
    devices: DEVICES.map(({ id }) => ({ id })),
    schema: SCHEMAS[setup.mode],
    registers,
  })
  sim.edit('A', CASE, 'name', 'Asha Devi')
  sim.edit('A', CASE, 'status', 'open')
  sim.increment('A', CASE, 'visits')
  sim.addElement('A', CASE, 'tags', 'followup')
  // Sync over the default perfect network first, so the demo starts in agreement.
  sim.settle()
  sim.setConditions(network)
  return sim
}

export function seedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('seed')
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
  return Number.isSafeInteger(parsed) ? parsed : randomSeed()
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}

export function writeSeedToUrl(seed: number): void {
  const url = new URL(window.location.href)
  url.searchParams.set('seed', String(seed))
  window.history.replaceState(null, '', url)
}
