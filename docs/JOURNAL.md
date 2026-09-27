# Journal

Problems we hit and how we resolved them, newest last. Each entry records what
happened, why it mattered, and what changed.

## Milestone 0: setup

### Name collision with an established GitHub account

- **Faced:** The first choice, `splitbrain` (the distributed-systems term for
  a partitioned cluster), is the username of a well-known developer with
  several popular repos. Searching the name would surface their work first.
- **Resolved:** Chose `syncsim`. Only a few unrelated, zero-star repos use it.
  A search also found no existing project combining a sync engine with an
  interactive failure simulator.

### GitHub Pages cannot publish a private repo on the free plan

- **Faced:** The first push ran the Pages workflow; build passed but the
  deploy step failed, because Pages is not available for private repos on the
  free plan.
- **Resolved:** The deploy job is skipped while the repo is private
  (`if: ${{ !github.event.repository.private }}` in `pages.yml`). It will run
  automatically once the repo is made public.

## Milestone 1: engine core

### Clock drift must not let an old edit beat a newer one

- **Faced:** With plain wall-clock timestamps, a device whose clock runs an
  hour fast wins every conflict, even against edits made *after* seeing its
  change.
- **Resolved:** Hybrid logical clocks. On receiving an op, a device advances
  its clock past the op's timestamp, so its next edit always sorts later.
  Covered by `replica.test.ts` ("lets a later edit win even when the earlier
  writer's clock runs an hour ahead").

### Last-write-wins still loses truly concurrent edits

- **Faced:** When two devices edit the same field without having seen each
  other's change, one edit is silently discarded, and a fast clock decides
  which.
- **Resolved (for now):** Documented, not hidden. A test pins the behaviour
  ("documents the limit of LWW"). Milestone 3 adds vector clocks to detect
  these conflicts and CRDTs to avoid them for counters and sets.

### Out-of-order delivery leaves gaps in what a device knows

- **Faced:** If op 2 from a device arrives before op 1, a single "highest seq
  seen" number would claim op 1 is held when it is not, and it would never be
  re-sent.
- **Resolved:** The version vector tracks only the *contiguous* prefix. Ops
  past a gap are applied immediately (LWW does not care about order) and held
  in a pending set until the gap fills.

### Proving the convergence test can actually fail

- **Faced:** All tests passed on the first run, which says nothing about
  whether they can catch a bug.
- **Resolved:** Mutation check: changed the merge rule to "latest arrival
  wins". The property test failed after 24 runs, with a minimal two-edit
  counterexample. The rule was restored and the check is now standard for
  every property test.

## CI and linting

### oxlint flags every JSX line in the playground

- **Faced:** With oxlint's correctness and suspicious categories enabled, the
  `react/react-in-jsx-scope` rule reported every JSX element.
- **Resolved:** Turned the rule off in `.oxlintrc.json`. It targets the old JSX
  transform; React 19 uses the automatic runtime, which does not need `React`
  in scope.

### Tests ran twice on every push to main

- **Faced:** The Pages workflow ran the test suite, and the new CI workflow did
  too.
- **Resolved:** CI (`ci.yml`) owns lint, typecheck, tests and build. The Pages
  workflow only builds and deploys.

## Milestone 2: network simulator

### Property tests were generating tiny histories

- **Faced:** fast-check biases generated arrays toward small sizes. Sampling
  showed an average of about 5 commands per run, too few to exercise
  partitions, offline toggles and retries together. The milestone 1
  convergence test had the same weakness.
- **Resolved:** Both property tests now generate 10 to 80 commands per run
  (`minLength: 10, maxLength: 80, size: 'max'`).

### Deciding when devices have really converged

- **Faced:** Comparing version vectors and visible state is not enough. Two
  devices can match on both while one still holds an extra op past a gap, which
  could change state once the gap fills.
- **Resolved:** `converged()` compares the full set of op ids each device
  holds. State is a pure function of the op set, so equal sets guarantee equal
  state.

### Mutation check for the network property test

- **Faced:** The network property test needed the same proof that it can fail.
  A first mutation (ignoring duplicate responses) was not a real bug, since the
  original copy still arrives, and the test rightly passed.
- **Resolved:** A real bug (every sync response from device `a` is dropped)
  was caught after 2 runs, with a single-edit counterexample.

### Stacked PR lost its base branch

- **Faced:** PR #2 was going to target the milestone 1 branch, but PR #1 had
  already been merged and its branch deleted, so creating the PR failed.
- **Resolved:** Opened PR #2 against `main`. The branch is exactly the
  milestone 2 commits ahead of `main`.

## Milestone 3: merge strategies and CRDTs

### Vector clocks alone gave wrong or order-dependent conflicts

- **Faced:** The plan was to stamp each write with the writer's version vector
  and call a write "replaced" if a later write's vector covered it. Two
  problems showed up on paper before any code:
  - The version vector only covers the contiguous prefix of ops, so a value
    the writer had actually seen (but received past a gap) would not count as
    replaced, producing false conflicts.
  - Keeping only the current "winners" and discarding replaced writes as ops
    arrive makes the result depend on arrival order, which would break
    convergence.
- **Resolved:** Each write records exactly which values it replaces
  (`supersedes`: the ids of the values standing on the writer's device at that
  moment). The multi-value strategy computes, over all writes to the field,
  those that nobody lists as replaced. That is a pure function of the op set,
  so it cannot depend on arrival order, and it matches what the user saw on
  screen. The same idea powers the OR-set (`observed` on removes).

### Keeping the log strategy-independent

- **Faced:** The playground needs to flip between strategies on the same
  history, but a register built for last-write-wins throws away losing values.
- **Resolved:** The replica keeps every op per field and derives values on
  read. `supersedes` is always recorded, whatever the current strategy, so
  switching to `multi-value` later still reports only real conflicts.

### Conflicts listed in a different order on each device

- **Faced:** Extending the network property test to all strategies found a
  real bug immediately: every device found the same conflicts, but
  `conflicts()` listed them in the order each device had received the records,
  so the lists differed. Field order in `read()` had the same problem.
- **Resolved:** `conflicts()`, `read()` and `snapshot()` sort by record and
  field, so every device shows identical output. The property test now also
  compares conflicts across devices.

### Showing how naive apps lose updates

- **Faced:** To demonstrate why CRDTs matter, the "wrong" way has to be real,
  not a strawman.
- **Resolved:** `increment` and `addElement` on a register field do exactly
  what a typical app does (read the value, write back the new one). Tests show
  two offline visits becoming one extra visit instead of two, and a concurrent
  tag add being wiped out, while the counter and set fields keep both.

### Mutation checks for the new code

- **Faced:** New merge rules need the same proof that the tests can fail.
- **Resolved:** Three planted bugs, each caught: a counter that ignores
  decrements (3 tests failed), a remove that cancels unseen adds (4 failed),
  and multi-value ignoring `supersedes` (4 failed).

## Milestone 4: playground

### The timeline could not tell when a message would arrive

- **Faced:** Send events were recorded before the latency was chosen, so every
  send event said the message would arrive the moment it left.
- **Resolved:** The simulation records the send event after picking the
  latency, so it carries the real delivery time. The random draws happen in
  the same order as before, so every seed still replays the same run. A test
  checks that each delivered message matches its send event.

### Clock drift was fixed at start-up

- **Faced:** The "clock liar" demo needs a phone's clock set wrong while the
  demo is running, but skew could only be set when the simulation was created.
- **Resolved:** `Simulation.setClockSkew`. The device's logical clock still
  never goes backwards when its wall clock jumps back, which a test pins down.

### "Cannot move time backwards" in the browser

- **Faced:** The first browser run logged a `RangeError`. `requestAnimationFrame`
  passes the frame's start time, which can be earlier than the
  `performance.now()` taken when the loop started, giving a negative step.
- **Resolved:** The frame step is clamped at zero.

### Sync stalled for a minute after a reset

- **Faced:** After switching between plain values and CRDTs (which resets the
  demo), phones stopped syncing. One last frame of the old world ran after the
  reset and advanced the shared "next gossip" time using the old world's clock,
  about a minute ahead of the new one.
- **Resolved:** The gossip schedule stores which simulation it belongs to and
  restarts when the simulation changes.

### Timeline misclassified dropped messages

- **Faced:** The timeline walks the event log backwards, so a message's drop
  event is seen before its send event. The first version checked for the send
  event and so could never match.
- **Resolved:** Drops are classified from the message itself: a message lost in
  transit, or one that already had a delivery time, was in the air; anything
  else was refused before it left (offline sender or partition).

### "All phones agree" while a conflict was open

- **Faced:** Under "Keep conflicts", the header said every phone agreed while
  each phone showed a conflict. Both were true (the phones hold the same data),
  but it read as a contradiction.
- **Resolved:** The header says "All phones in sync" and shows a separate
  "open conflict" count.

### Layout issues found in screenshots

- **Faced:** Messages from just before the window drew over the lane labels;
  the timeline was cramped at phone width; strategy and partition buttons
  wrapped unevenly; on phones every control came before the first phone.
- **Resolved:** The plot is clipped to its area; narrow screens get one-letter
  lanes and an 8 s window; the button groups use a grid; on narrow screens the
  phones come first and the controls follow.

### Testing in a real browser

- **Faced:** The Chrome DevTools tool could not start because another session's
  browser held its profile, and the first dev-server start passed the port flag
  through npm workspaces wrongly, so Vite served a folder named `5199` and every
  page returned 404.
- **Resolved:** Started Vite from `apps/playground` directly, and drove the
  installed Chrome with a small `playwright-core` script instead of killing the
  other session's browser. The script runs all three "Things to try" recipes
  and conflict resolution, checks the outcomes, captures console errors, and
  screenshots desktop, light mode and a 390 px phone width.

## Milestone 5: scenarios, write-up and live tabs

### Scenarios have to play out the same way every time

- **Faced:** A guided scenario makes claims in its captions ("B's edit wins",
  "the case says 2, not 3"). With auto-sync on a timer and a lossy network,
  whether a claim held would depend on timing.
- **Resolved:** Each scenario has a fixed seed and a lossless network, and
  auto-sync is off while it runs, so phones sync only when a step says so.
  `scenarios.test.ts` plays every scenario without the UI and asserts each
  caption after each step, so a caption cannot silently become false.

### The phone panel was tied to the simulator

- **Faced:** The live-tab demo needed the same phone panel, but `Phone` read
  everything from a `Simulation` (online state, clock skew, edits).
- **Resolved:** `Phone` now takes a view (a replica plus online and clock
  state) and a set of actions. The simulator and the live tab each supply
  their own.

### Setting state inside an effect

- **Faced:** The first live hook created the session inside an effect and then
  stored it in state, which oxlint flags (`react/set-state-in-effect`). It also
  would not have survived React StrictMode's mount, unmount, remount in
  development: the first cleanup would close the channel for good.
- **Resolved:** `LiveSession` opens its channel lazily with `start()` and can
  be stopped and started again. The hook creates the session once in
  `useState` and the effect only starts and stops it. The strategy is set from
  the click handler instead of an effect.

### A test that could not fail

- **Faced:** The first test for "only the tab a reply is addressed to applies
  it" passed even with the address check removed, because the other tab
  already held the op.
- **Resolved:** The test now sends a reply addressed to one tab by hand, with
  an op that exists nowhere else on the bus. Removing the address check makes
  it fail; restoring it makes it pass.

### Live tabs hid conflicts

- **Faced:** The browser test took one tab offline, edited the status in both
  tabs and reconnected, and found no conflict. The live session defaulted to
  "logical clock wins", so the demo's most interesting case was invisible.
- **Resolved:** Live tabs start on "Keep conflicts". Because strategies only
  affect how a replica reads its history, a tab that switches strategy shows a
  different result while the other tab still shows the conflict, on the same
  edits.

### Known limitation: two tabs opened at the same moment

- **Faced:** A new tab waits 800 ms for peers and creates the patient case if
  nobody answered. Two tabs opened at the same instant can both create it.
- **Resolved (accepted):** The copies merge like any concurrent edits: the name
  and status resolve by the strategy, and the visit counter shows 2. It is a
  demo seeding shortcut, not a sync bug, so it is documented rather than
  engineered away.

## UI upgrade: network view and "why this value?"

### The first playground looked basic

- **Faced:** It worked, but read as forms plus a chart. Messages moving,
  getting lost and arriving twice, the thing the project is about, happened
  in a small timeline under the phones, and nothing explained why a value won.
- **Resolved:** A network view where messages visibly travel between the
  phones and links visibly break, and a "why?" panel on every field that marks
  silently lost edits in red. Both read data the engine already had; the only
  engine additions are `Replica.explain` and `Simulation.reachable`.

### "Replaced" is not the same as "lost"

- **Faced:** Under last-write-wins, both an edit someone saw and changed, and
  an edit nobody ever saw, end up hidden. Showing both as "lost" would blame
  the engine for normal editing.
- **Resolved:** `supersedes` already records what each writer saw. An edit
  listed there is **replaced**; an edit that is neither standing nor replaced
  was discarded without anyone seeing it, and only that is **silently lost**.

### Shared traffic logic, and its order

- **Faced:** The timeline and the network view both need "what became of each
  message". Duplicating the backwards walk over the event log would let the two
  views disagree.
- **Resolved:** `flights.ts` (`collectTraffic`) serves both and now records
  when each message was dropped or delivered. Its first test caught that it
  returned messages newest first; it now returns every list oldest first.

### An accessible name that clashed with a form field

- **Faced:** The browser test could not select "Status on Phone A": the new
  why button was named "Why is status on Phone A this value?", which contains
  the same text. Screen reader users would hit the same ambiguity.
- **Resolved:** The button is named "Explain the status value on Phone A".

### A warning colour overridden by the open state

- **Faced:** The "why? · 1 lost" button turned from red to the accent colour
  when opened, because the open-state rule was more specific.
- **Resolved:** The lost style uses a more specific selector, so a lost edit
  stays red whether the panel is open or not.

### Same edits, three rules, without switching

- **Faced:** The difference between strategies only showed if a visitor knew
  to flip the switch and remembered what it said before.
- **Resolved:** The comparison table reads the same ops under all three
  strategies at once, using the engine's own `standingWrites` and
  `explainField`, so it cannot drift from what the phones display.

### A flash that does not steal focus

- **Faced:** Highlighting a value when it changes is easiest by remounting the
  field, but remounting a select or input takes focus away from a keyboard user
  mid-edit.
- **Resolved:** Only an empty overlay is keyed by the value, so React mounts a
  fresh overlay and its CSS animation plays once while the inputs stay put. It
  is switched off under `prefers-reduced-motion`.

### A tour that plays on first visit, without an effect setting state

- **Faced:** Starting the tour from an effect after mounting would set state
  inside an effect, which lint rejects, and would flash the normal view first.
- **Resolved:** `useSimulation` takes an optional scenario and starts inside it:
  every piece of state is initialised from the scenario. The tour is chosen once
  (`useState(firstVisitTour)`), skipped for `?seed=` links so shared runs open
  exactly as shared, and remembered in `localStorage`, guarded because storage
  can be blocked.

### Two buttons with the same name

- **Faced:** The comparison rows and the strategy control both had a button
  named "Keep conflicts"; the browser test could not tell them apart, and
  neither could a screen reader user.
- **Resolved:** The row buttons are named "Use Keep conflicts" and so on.
