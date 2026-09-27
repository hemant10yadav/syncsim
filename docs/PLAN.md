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
| 2 | Seeded network simulator: latency, loss, duplication, offline devices, partitions, settling | Done (PR #2) |
| 3 | Switchable register strategies (wall-clock LWW, HLC LWW, multi-value conflicts); CRDTs: PN-counter, OR-set | Done (PR #3) |
| 4 | Playground: three devices, network controls, message timeline, strategy switcher | Done (PR #4) |
| 5 | Preset scenarios, `APPROACH.md`, cross-tab sync via BroadcastChannel, portfolio card | In progress: scenarios, write-up and live tabs in review; launch and portfolio card next |

### 1. Engine core (done)

- `HybridClock` (`src/hlc.ts`): timestamps that never go backwards and always
  sort after anything the device has seen.
- `Replica` (`src/replica.ts`): keeps every edit in a log; state is derived
  per field with last-write-wins. Idempotent and order-independent.
- Version vectors: each device describes what it holds, peers send only what
  is missing (`missingFor`), gaps from out-of-order delivery are tracked.
- CI (`.github/workflows/ci.yml`): oxlint, typecheck, tests and build on every
  PR.

### 2. Network simulator (done)

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

### 3. Conflict-aware strategies (done)

- A schema gives each field a kind: `register`, `counter` or `set`
  (`src/types.ts`). Unlisted fields are registers.
- State is derived from the log on demand, so the register strategy can be
  switched at any time and the same history is re-read under the new rule
  (`Replica.setRegisterStrategy`, `Simulation.setRegisterStrategy`).
- Register strategies (`src/registers.ts`):
  - `lww-wall`: latest device clock wins. The naive baseline that lets a
    fast clock beat newer edits.
  - `lww-hlc`: latest hybrid logical clock wins. Respects "saw it, then
    changed it", still drops one of two concurrent writes.
  - `multi-value`: every write lists the values it replaces (`supersedes`);
    anything not replaced stays standing, so concurrent writes surface as a
    `Conflict` until someone writes a resolution.
- CRDTs (`src/crdt.ts`):
  - PN-counter for visit counts: concurrent increments are never lost.
  - OR-set for tags: a remove cancels only the adds it had seen, so a
    concurrent add wins and removed tags can come back.
- Naive app behaviour for comparison: `increment` and `addElement` on a
  register field read the value and write it back, which is exactly how
  real apps lose concurrent updates.
- Tests pin down what each strategy keeps and loses
  (`test/strategies.test.ts`), and the network property test now covers all
  strategies, counters and sets, and checks no increment is ever lost.

### 4. Playground (done)

- `apps/playground`, React + Vite, styled with the portfolio's colour tokens
  and fonts, dark and light themes.
- `useSimulation` drives one `Simulation` in virtual time: each animation
  frame advances the clock by real time times the chosen speed, and a gossip
  round runs every 2.5 virtual seconds while auto-sync is on.
- Three phone panels editing one patient case: name, status, visits, tags.
  Each phone can go offline and have its clock set 1 h slow or fast.
- Conflicts under "Keep conflicts" appear on every phone, with a picker that
  writes the resolution.
- Controls: play/pause, speed, auto-sync, sync now, reset, new seed, merge
  strategy, plain values vs CRDTs, delay, loss, duplication, partitions.
- Timeline: a sequence diagram of the last 15 s (8 s on phones) built from the
  event log, showing edits, requests, responses, duplicates and losses.
- The seed lives in the URL (`?seed=42`), so a run can be shared.
- Engine additions for the UI: send events carry the real delivery time, and
  `Simulation.setClockSkew` changes a device clock mid-run.

### 5. Polish (in progress)

Done, in review:

- Guided scenarios (`apps/playground/src/scenarios.ts`), each with a fixed
  seed, a lossless network and auto-sync off so they play out the same way
  every time: "Two health workers edit the same case", "The clock liar",
  "Offline visits get lost", "Counters keep every visit", "Duplicate
  delivery". Step-by-step player with Next, Restart and Exit.
- `scenarios.test.ts` plays every scenario without the UI and checks its
  captions are true after each step. The playground now has its own vitest
  suite, and the root `npm test` runs every workspace.
- `docs/APPROACH.md`: design write-up, trade-offs, and where it would break in
  production.
- Live tabs (`?view=live`): each browser tab is a real device.
  `LiveSession` runs the same pull protocol over BroadcastChannel, plus an
  immediate push of fresh edits. Tested with an in-memory bus.
- `Phone` takes a view and actions instead of a `Simulation`, so the same
  panel renders simulated phones and real tabs.

### UI upgrade (in review)

The first playground looked like a set of forms: the interesting behaviour
(messages moving, edits being lost) was hidden. All five parts ship in one PR.

- Network view (`components/NetworkView.tsx`): the phones as nodes on a
  triangle, links that break when a phone is offline or partitioned, messages
  moving along the links (requests, edits, empty replies, duplicates), bursts
  where messages are lost, pulses where edits are made or arrive, and each
  phone's sync state. Click or press Enter on a phone to take it offline.
- "Why this value?" on every field (`components/WhyPanel.tsx`, backed by
  `Replica.explain`): every edit to the field and what became of it. A write
  that last-write-wins discarded is marked "silently lost", in red, with the
  reason.
- The guided scenarios stay as they are; one caption now points at "why?".
- Strategy comparison (`components/StrategyComparison.tsx`): every plain-value
  field under all three strategies at once, with how many edits each one
  silently loses, for the edits a chosen phone holds. Differing columns are
  flagged; clicking a row switches the strategy.
- Edit log on every phone (`components/EditLog.tsx`): its edits newest first,
  where each came from, its version vector, and edits held past a gap.
- Polish: phones drawn as devices with a status bar (the device's own clock,
  signal or "no signal"), a flash on any value that changes, and a first-visit
  tour that plays "Two health workers" by itself (skipped for shared `?seed=`
  links, pausable, shown once).

Then:

- Make the repo public, enable Pages, check the live URL, README screenshot.
- Add the syncsim project card to the portfolio.

## Out of scope for now

- Publishing to npm (the engine is written so this is a one-step change later).
- Real cross-device sync over the internet (would need a relay such as a
  Cloudflare Worker).
- Persistence (IndexedDB) and schema migrations.
