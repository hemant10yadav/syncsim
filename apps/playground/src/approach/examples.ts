import {
  createRng,
  explainField,
  isSet,
  pull,
  Replica,
  standingWrites,
  syncPair,
  type FieldValue,
  type Operation,
  type RegisterStrategy,
  type ReplicaOptions,
  type SetOperation,
  type Timestamp,
} from '@syncsim/engine'

/**
 * Every example on the approach page, built with the real engine, so the page
 * shows what the code does rather than a hand-drawn story. `examples.test.ts`
 * pins down the claims the captions make.
 */

const CASE = 'case-1'
const HOUR = 3_600_000
/** 10:00 in ms after midnight, so example clocks read like times of day. */
const TEN_AM = 10 * HOUR

/** Devices sharing one true clock, each with its own skew. */
function world(options: ReplicaOptions = {}) {
  let now = TEN_AM
  return {
    advance: (ms: number) => (now += ms),
    device: (id: string, skewMs = 0) => new Replica(id, () => now + skewMs, options),
  }
}

const valueOf = (op: Operation) => (op.change.type === 'set' ? op.change.value : null)

// ── 1. The problem ──────────────────────────────────────────────────────────

export interface ProblemStep {
  readonly caption: string
  readonly a: FieldValue | undefined
  readonly b: FieldValue | undefined
  readonly online: boolean
  /** Set on the last step: the edit that disappeared. */
  readonly lost?: { readonly value: FieldValue; readonly by: string }
}

/** Two phones, one record, both offline, merged with "latest edit wins". */
export function problemSteps(): ProblemStep[] {
  const w = world({ registers: 'lww-hlc' })
  const a = w.device('A')
  const b = w.device('B')
  const status = (r: Replica) => r.value(CASE, 'status')

  a.set(CASE, 'status', 'open')
  syncPair(a, b)
  const steps: ProblemStep[] = [
    { caption: 'Both phones show the same case: status open.', a: status(a), b: status(b), online: true },
    { caption: 'Both lose signal. Each keeps working on its own copy.', a: status(a), b: status(b), online: false },
  ]
  w.advance(60_000)
  a.set(CASE, 'status', 'visited')
  steps.push({ caption: 'On phone A, a health worker marks the case visited.', a: status(a), b: status(b), online: false })
  w.advance(30_000)
  b.set(CASE, 'status', 'referred')
  steps.push({ caption: 'On phone B, a colleague marks it referred.', a: status(a), b: status(b), online: false })

  syncPair(a, b)
  const lost = a.explain(CASE, 'status').find((e) => e.verdict.kind === 'lost')!
  steps.push({
    caption: 'Signal returns and the phones sync. The later edit wins everywhere. Nobody is told about the other one.',
    a: status(a),
    b: status(b),
    online: true,
    lost: { value: valueOf(lost.op), by: lost.op.node },
  })
  return steps
}

// ── 2. Why clocks lie ───────────────────────────────────────────────────────

export interface ClockEdit {
  readonly device: string
  readonly value: FieldValue
  /** What the device's own clock read when the edit was made. */
  readonly deviceTime: number
  readonly ts: Timestamp
}

export interface ClockExample {
  readonly skewMs: number
  /** A's edit, made first, on a clock running fast. */
  readonly first: ClockEdit
  /** B's correction, made after seeing A's edit. */
  readonly second: ClockEdit
  readonly winners: Readonly<Record<'lww-wall' | 'lww-hlc', FieldValue>>
}

/** A's clock runs an hour fast. B sees A's edit, then corrects it. */
export function clockExample(): ClockExample {
  const w = world()
  const a = w.device('A', HOUR)
  const b = w.device('B')
  const first = a.set(CASE, 'status', 'visited')
  pull(b, a)
  w.advance(60_000)
  const second = b.set(CASE, 'status', 'closed')
  const ops = [first, second].filter(isSet)
  const edit = (op: Operation): ClockEdit => ({ device: op.node, value: valueOf(op), deviceTime: op.deviceTime, ts: op.ts })
  return {
    skewMs: HOUR,
    first: edit(first),
    second: edit(second),
    winners: {
      'lww-wall': standingWrites('lww-wall', ops)[0]!.change.value,
      'lww-hlc': standingWrites('lww-hlc', ops)[0]!.change.value,
    },
  }
}

// ── 3. The key idea ─────────────────────────────────────────────────────────

export interface KeyIdeaWrite {
  readonly op: SetOperation
  readonly label: string
}

/**
 * Writes to one field: an initial value, two concurrent edits that each replace
 * it, and optionally a supervisor's resolution that replaces both.
 */
export function keyIdeaWrites(withResolution: boolean): KeyIdeaWrite[] {
  const w = world({ registers: 'multi-value' })
  const a = w.device('A')
  const b = w.device('B')
  const c = w.device('C')
  const writes: KeyIdeaWrite[] = []
  const add = (op: Operation, label: string) => writes.push({ op: op as SetOperation, label })

  add(a.set(CASE, 'status', 'open'), 'Phone A opens the case')
  syncPair(a, b)
  pull(c, a)
  w.advance(1_000)
  add(a.set(CASE, 'status', 'visited'), 'Phone A, offline')
  w.advance(500)
  add(b.set(CASE, 'status', 'referred'), 'Phone B, offline')
  if (withResolution) {
    pull(c, a)
    pull(c, b)
    w.advance(1_000)
    add(c.set(CASE, 'status', 'visited'), 'A supervisor on phone C picks one')
  }
  return writes
}

export interface Delivery {
  /** Op ids in the order a fresh phone received them. */
  readonly order: readonly string[]
  /** Values still standing on that phone, sorted. */
  readonly standing: readonly FieldValue[]
}

/** Deliver the writes to a fresh phone in a shuffled order, and read what is standing. */
export function deliverShuffled(writes: readonly KeyIdeaWrite[], seed: number): Delivery {
  const rng = createRng(seed)
  const order = writes.map((w) => w.op)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const phone = new Replica('fresh', () => TEN_AM, { registers: 'multi-value' })
  phone.receive(order)
  const standing = standingWrites('multi-value', phone.explain(CASE, 'status').map((e) => e.op).filter(isSet))
  return {
    order: order.map((op) => op.id),
    standing: standing.map((op) => op.change.value).sort(),
  }
}

// ── 4. Three strategies, same edits ─────────────────────────────────────────

export interface StrategyOutcome {
  readonly shown: readonly FieldValue[]
  readonly lost: readonly FieldValue[]
}

export interface History {
  readonly title: string
  readonly story: string
  readonly outcomes: Readonly<Record<RegisterStrategy, StrategyOutcome>>
}

function outcomes(ops: readonly Operation[]): Record<RegisterStrategy, StrategyOutcome> {
  const sets = ops.filter(isSet)
  const read = (strategy: RegisterStrategy): StrategyOutcome => ({
    shown: standingWrites(strategy, sets).map((op) => op.change.value),
    lost: explainField('register', strategy, ops)
      .filter((e) => e.verdict.kind === 'lost')
      .map((e) => valueOf(e.op)),
  })
  return { 'lww-wall': read('lww-wall'), 'lww-hlc': read('lww-hlc'), 'multi-value': read('multi-value') }
}

/** The same two histories read under every strategy. */
export function strategyHistories(): History[] {
  const concurrent = (() => {
    const w = world()
    const a = w.device('A')
    const b = w.device('B')
    const ops = [a.set(CASE, 'status', 'visited')]
    w.advance(30_000)
    ops.push(b.set(CASE, 'status', 'referred'))
    return ops
  })()

  const correction = (() => {
    const w = world()
    const a = w.device('A', HOUR)
    const b = w.device('B')
    const ops = [a.set(CASE, 'status', 'visited')]
    pull(b, a)
    w.advance(60_000)
    ops.push(b.set(CASE, 'status', 'closed'))
    return ops
  })()

  return [
    {
      title: 'Concurrent edits',
      story: 'A marks it visited, B marks it referred 30 s later. Neither saw the other.',
      outcomes: outcomes(concurrent),
    },
    {
      title: 'Fast clock, then a correction',
      story: 'A’s clock is an hour fast. A marks it visited; B sees that and corrects it to closed.',
      outcomes: outcomes(correction),
    },
  ]
}

// ── 5. CRDTs ────────────────────────────────────────────────────────────────

export interface CounterExample {
  readonly start: number
  readonly plain: number
  readonly counter: number
}

/** The case has 1 visit. Two workers each record a visit while offline. */
export function counterExample(): CounterExample {
  const run = (options: ReplicaOptions) => {
    const w = world(options)
    const a = w.device('A')
    const b = w.device('B')
    a.increment(CASE, 'visits')
    syncPair(a, b)
    a.increment(CASE, 'visits')
    w.advance(1_000)
    b.increment(CASE, 'visits')
    syncPair(a, b)
    return a.value(CASE, 'visits') as number
  }
  return { start: 1, plain: run({}), counter: run({ schema: { visits: 'counter' } }) }
}

export interface SetExample {
  readonly plain: readonly string[]
  readonly set: readonly string[]
}

/**
 * The case is tagged urgent on both phones. Offline, B removes the tag while A
 * adds it again (a new add, which B has not seen).
 */
export function setExample(): SetExample {
  const run = (options: ReplicaOptions) => {
    const w = world(options)
    const a = w.device('A')
    const b = w.device('B')
    a.addElement(CASE, 'tags', 'urgent')
    syncPair(a, b)
    a.addElement(CASE, 'tags', 'urgent')
    w.advance(1_000)
    b.removeElement(CASE, 'tags', 'urgent')
    syncPair(a, b)
    return (a.value(CASE, 'tags') as readonly string[]) ?? []
  }
  return { plain: run({}), set: run({ schema: { tags: 'set' } }) }
}
