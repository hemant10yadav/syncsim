# Approach

How syncsim works, why it is built this way, and where it would break in
production.

## The problem

Several devices hold copies of the same records and edit them while offline.
When they reconnect, every device must end up with the same data (convergence),
and nobody's work should disappear without a trace. The network between them is
hostile: messages are delayed, reordered, duplicated or lost, devices drop off
and come back, groups of devices are cut off from each other, and device clocks
are wrong.

There is no single right merge rule. The project's point is to make the
trade-offs concrete: implement several rules, run them against the same
histories, and show exactly what each one keeps and loses.

## Architecture

```
packages/engine                      apps/playground
┌──────────────────────────────┐     ┌──────────────────────────────────┐
│ HybridClock   (hlc.ts)       │     │ useSimulation: drives a          │
│ Replica       (replica.ts)   │◀────│   Simulation in virtual time     │
│   op log, version vector,    │     │ scenarios.ts: scripted stories   │
│   derived state              │     │ Phone / Controls / Timeline      │
│ registers.ts  crdt.ts        │     │                                  │
│ Simulation    (simulation.ts)│     │ LiveSession: a Replica per tab   │
│   virtual time, network,     │     │   over BroadcastChannel          │
│   event log                  │     └──────────────────────────────────┘
└──────────────────────────────┘
```

The engine has no DOM or React dependencies. The playground only reads engine
state and calls engine methods; every merge decision happens in the engine,
where it is tested.

## Operations and the log

Every edit is an **operation** (`types.ts`):

| Field | Purpose |
|---|---|
| `id` = `node:seq` | Globally unique. Receiving the same id twice is a no-op, which makes duplicate delivery harmless. |
| `seq` | Counts the ops a device has made: 1, 2, 3, ... Lets peers describe what they hold compactly. |
| `ts` | Hybrid logical clock timestamp, used for ordering. |
| `deviceTime` | The device's raw clock reading. Only the naive wall-clock strategy uses it. |
| `change` | `set` (register), `increment` (counter), `add` / `remove` (set). |

A `set` records `supersedes`: the ids of the values the writer had on screen for
that field. A `remove` records `observed`: the ids of the adds it had seen. These
two fields are what make conflicts and set removals precise (see below).

A `Replica` keeps every op and **derives** readable state on demand. Nothing is
overwritten in place. Two consequences:

1. State is a pure function of the *set* of ops held, so any two replicas with
   the same ops show the same state, regardless of arrival order.
2. The register strategy can be switched at any time and the same history is
   re-read under the new rule. The playground relies on this to compare
   strategies on identical edits.

## Clocks

Plain wall-clock timestamps fail in two ways: clocks drift, and a clock that is
ahead lets a device win every conflict, even against edits made *after* seeing
its change.

`HybridClock` implements hybrid logical clocks (Kulkarni et al., 2014). A
timestamp is `(wall, counter, node)`:

- For a local event, `wall` becomes `max(previous wall, physical time)`, and the
  counter increments if `wall` did not move. Timestamps never go backwards, even
  if the device clock does.
- On receiving an op, the clock advances past the op's timestamp. So any edit a
  device makes after seeing another edit sorts after it. "I saw it, then
  changed it" is always respected.
- `node` breaks exact ties, so the order is total and every replica agrees on
  it.

What HLC does not do is decide truly concurrent writes fairly: when two devices
write without having seen each other, the one with the faster clock still sorts
later.

## Sync protocol

Sync is pull-based:

1. A device sends a **sync request** carrying its version vector.
2. The peer replies with every op the vector does not cover (`missingFor`).
3. The requester applies them. Ops it already holds are ignored.

The **version vector** maps each device to the highest `seq` such that *every*
op `1..seq` from that device is held. Only the contiguous prefix counts. If op 5
arrives before op 4, the vector stays at 3 and op 5 waits in a pending set; the
op is still applied immediately (every merge rule is order-independent), but the
vector does not claim op 4 is held, so a later pull still asks for it.

Lost requests or responses cost nothing but time: the next gossip round asks
again. Duplicates are dropped by op id. Reordering does not matter because the
merge rules do not depend on order. So the protocol needs no acknowledgements,
retries or sequence tracking beyond the version vector.

The live-tab demo adds a **push**: a fresh local edit is broadcast straight away,
so other tabs update without waiting for the next pull. The pull still runs
every 2 s and is what guarantees catch-up.

## Merge rules

A **schema** gives each field a kind. Unlisted fields are registers.

### Registers: three strategies

| Strategy | Rule | Keeps | Loses |
|---|---|---|---|
| `lww-wall` | Latest `deviceTime` wins | Nothing extra | Newer edits, whenever an older one came from a device with a faster clock |
| `lww-hlc` | Latest HLC timestamp wins | "Saw it, then changed it" ordering | One of two truly concurrent writes, silently |
| `multi-value` | Every write not listed in some other write's `supersedes` stays standing | Every concurrent write, shown as a `Conflict` | Nothing, but a person has to resolve the conflict |

`multi-value` resolves as soon as anyone writes the field: that write lists
every standing value in `supersedes`, so all of them are replaced at once.

**Why `supersedes` instead of vector clocks.** The obvious design stamps each
write with the writer's version vector and treats a write as replaced if a
later write's vector covers it. That fails here, because the vector only covers
the contiguous prefix: a value the writer *had* seen (but received past a gap)
would not count as replaced, producing false conflicts. Recording exactly which
op ids the writer saw matches what was on screen, and "standing = not listed by
anyone" is a pure function of the op set, so it cannot depend on arrival order.

### Counters: PN-counter

Each increment is its own op with `by` (negative for decrements). The value is
the sum. Because every op is applied exactly once, concurrent increments from
different devices all count. Two offline visits give +2, where a plain value
("read, add one, write back") gives +1.

### Sets: observed-remove set

Every add is tagged with its op id. A remove cancels only the add tags its
writer had seen (`observed`). An element is present if it has any add not
cancelled. So an add made concurrently with a remove survives ("add wins"), and
a removed element can be added again.

### Schema mismatches

If an op's change does not match its field's kind (possible only if devices
disagree on the schema), every replica ignores it the same way, so state still
converges. Local edits of the wrong kind throw.

### Explaining outcomes

`Replica.explain(record, field)` lists every edit to a field, oldest first,
with what became of it under the current strategy:

- **shown** or, under multi-value, **competing**.
- **replaced**: a later write listed it in `supersedes`, so its author saw it.
- **silently lost**: not replaced and not standing. Only last-write-wins
  produces this, and it is exactly the case users never hear about: a
  concurrent edit that was dropped.
- Counters: every increment is **counted**. Sets: adds are **present** or
  **removed** by the removes that saw them.

The playground's "why?" panels are built on this, so the explanation comes from
the same code that computes the value rather than from a separate guess.

### Deterministic output

Maps iterate in arrival order, which differs between devices. `read`,
`snapshot` and `conflicts` sort by record and field so every device shows
identical output. This was found by a property test, not by inspection.

## Simulation

`Simulation` runs devices in **virtual time**: nothing happens until
`advance(ms)` moves the clock, and messages are delivered in order of arrival
time. Every random choice (latency, loss, duplication) comes from one seeded
generator, so a seed and a sequence of calls always reproduce the same run, down
to the event log. Any failure can be replayed exactly.

Conditions: a latency range (which also reorders messages), a drop rate and a
duplicate rate. Topology: devices go offline, partitions split devices into
groups, and a message in the air is lost if its link goes down before it lands.
`settle()` gossips until every device holds the same set of op ids.

The **event log** (`edit`, `send`, `drop`, `deliver`) is what the playground's
timeline draws. Send events carry the real delivery time, so a message can be
drawn in flight before it arrives.

## How the claims are tested

- **Unit tests** for clocks, strategies, CRDTs, replicas and the simulation.
- **Property tests** (fast-check): hundreds of random histories of 10 to 80
  steps mixing edits, counter and set operations, partial syncs, partitions,
  offline devices, strategy switches, clock skew up to an hour, and up to 30%
  message loss and duplication. After the network heals, every device must hold
  identical data and identical conflicts, and every counter must equal the sum
  of all increments ever made.
- **Order-independence properties** for each merge rule: shuffling the ops
  never changes the result.
- **Mutation checks**: for each property test, a bug is planted on purpose
  (arrival order wins, a device's responses always drop, a counter ignores
  decrements, a remove cancels unseen adds, multi-value ignores `supersedes`) to
  confirm the tests catch it.
- **Scenario tests**: every guided scenario is played without the UI, and the
  test checks that its captions are true after each step.
- **Browser tests**: a Playwright script plays every scenario and the "Things to
  try" recipes in Chrome, syncs two real tabs, and checks outcomes, console
  errors and layout at phone width.

## Where this would break in production

The engine is correct for what it models, but a real deployment would hit these
limits:

- **The log grows forever.** Every op is kept, including replaced register
  values and cancelled set adds. Real systems compact: once every device is
  known to hold an op (causal stability), older ops can be folded into a
  snapshot. That needs knowing the set of devices, which this design does not
  track.
- **Sync cost is linear in history.** `missingFor` scans the whole log, and a
  device that was offline for weeks receives every op it missed in one
  response. Production sync would page responses, index ops by device and seq,
  and send snapshots instead of full history.
- **Gossip is all-to-all.** Every device asks every other device each round,
  which is O(n²) messages. Real offline-first apps usually sync through a server
  that holds the canonical log, and devices talk only to it.
- **Version vectors grow with the number of devices.** Fine for three phones,
  not for thousands of short-lived installs. Server-assigned sequence numbers,
  or pruning retired devices, keep this bounded.
- **A clock years ahead poisons HLC.** A device with a wildly wrong clock pushes
  every other device's HLC forward, permanently. Production HLC rejects or
  clamps remote timestamps beyond a maximum drift.
- **Unresolved conflicts accumulate.** Multi-value keeps every concurrent value
  until someone writes the field. A real app needs a policy for conflicts nobody
  resolves.
- **No persistence.** State lives in memory. Surviving restarts needs durable
  storage (IndexedDB in a browser) and care to persist an op before
  acknowledging it.
- **Schema changes are not handled.** Changing a field from register to counter
  would make old ops be ignored. Real systems version the schema and migrate.
- **No trust model.** Any device can send any op with any id or timestamp. A
  real deployment authenticates devices, checks that `node` matches the sender,
  and authorises writes per record.
- **The live demo is one browser.** BroadcastChannel only reaches tabs of the
  same origin in the same browser profile. Syncing across machines needs a
  relay, such as a WebSocket server.

## What I would do next

1. Server-mediated sync with durable storage and snapshots, keeping the same op
   format and merge rules.
2. Log compaction once ops are known to be causally stable.
3. Maximum-drift rejection in `HybridClock`.
4. A text CRDT for free-form notes, where neither last-write-wins nor
   whole-value conflicts are acceptable.
