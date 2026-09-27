# Plan

## Why this exists

Offline-first apps (CommCare, Notion, Figma, WhatsApp) all face the same
question: two devices edit the same record while offline, then reconnect.
Which version wins, and does anyone's work get silently lost?

syncsim answers that question in code and makes the answer visible. It is a
portfolio project meant to show distributed-systems judgement, not CRUD:
correctness under unreliable networks, honest trade-offs, and tests that prove
the claims.

## What it is

1. **Engine** (`packages/engine`): a TypeScript sync library with no UI code.
   Replicas, clocks, merge strategies and a simulated network.
2. **Playground** (`apps/playground`): a React app that drives the engine
   visually. Three devices on screen, network controls, a live message
   timeline, and switchable merge strategies.
3. **Write-up** (`docs/APPROACH.md`, later): the design, what each strategy
   gives up, and where it would break in production.

## Ground rules

- **Hand-rolled merge logic.** No Yjs or Automerge; understanding the merge is
  the point.
- **Deterministic by construction.** Every random choice comes from a seed, so
  any failure can be replayed exactly.
- **Claims are tested.** Convergence is checked by property tests over
  thousands of random histories, and each property test is mutation-checked
  (break the code on purpose, confirm the test fails).
- **Failures are documented, not hidden.** Where a strategy loses data, a test
  shows exactly how.
- **Static deploy.** Everything runs in the browser, so it ships on GitHub
  Pages with no server.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Hybrid logical clock, op log, replica, per-field last-write-wins, version-vector sync, CI | Done (PR #1) |
| 2 | Seeded network simulator: latency, loss, duplication, offline devices, partitions, settling | In review (PR #2) |
| 3 | Vector clocks that surface real conflicts; CRDTs: LWW map, PN-counter, OR-set | Next |
| 4 | Playground: three devices, network controls, message timeline, strategy switcher | Planned |
| 5 | Preset scenarios, `APPROACH.md`, cross-tab sync via BroadcastChannel, portfolio card | Planned |

### 1. Engine core (done)

- `HybridClock` (`src/hlc.ts`): timestamps that never go backwards and always
  sort after anything the device has seen.
- `Replica` (`src/replica.ts`): keeps every edit in a log; state is derived
  per field with last-write-wins. Idempotent and order-independent.
- Version vectors: each device describes what it holds, peers send only what
  is missing (`missingFor`), gaps from out-of-order delivery are tracked.
- CI (`.github/workflows/ci.yml`): oxlint, typecheck, tests and build on every
  PR.

### 2. Network simulator (in review)

- `Simulation` (`src/simulation.ts`): virtual time; nothing happens until
  `advance()` moves the clock.
- Conditions: latency range (which also reorders), drop rate, duplicate rate.
- Topology: devices go offline; partitions split devices into groups;
  messages in flight are lost if their link goes down.
- Pull-based sync: a request carries the version vector, the response carries
  the missing ops. Lost messages are retried by the next gossip round.
- `settle()`: gossip until every device holds the same op set.
- Full event log (`edit`, `send`, `drop`, `deliver`) for the playground to
  animate.

### 3. Conflict-aware strategies (next)

- Make the merge rule pluggable instead of hard-wired LWW.
- Wall-clock LWW as the naive baseline, to show clock drift losing data.
- Vector clocks: detect true concurrency and keep both values as a conflict
  the user resolves, instead of silently picking one.
- CRDTs for fields where "last write" is the wrong question:
  - PN-counter for visit counts (concurrent increments are never lost)
  - OR-set for tags (add and remove from different devices without
    resurrecting or losing items)
- Per-strategy tests that pin down exactly which updates each one loses.

### 4. Playground (planned)

- Three phone panels editing one "patient case" record.
- Online/offline toggle per device, sliders for latency, loss and clock skew,
  partition controls, strategy dropdown.
- Message timeline built from the simulation's event log, with conflicts
  highlighted.
- Seed shown and editable, so any run can be shared and replayed.

### 5. Polish (planned)

- Preset scenarios: "Two health workers edit the same case", "The clock
  liar", "Duplicate delivery", each with step-by-step replay.
- `docs/APPROACH.md` design write-up.
- Real two-tab sync over BroadcastChannel.
- Make the repo public, enable Pages, add the project card to the portfolio.

## Out of scope for now

- Publishing to npm (the engine is written so this is a one-step change later).
- Real cross-device sync over the internet (would need a relay such as a
  Cloudflare Worker).
- Persistence (IndexedDB) and schema migrations.
