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
