# syncsim

An offline-first sync engine and a visual simulator for it.

Several devices edit the same record while offline. When they reconnect, their
changes have to merge without anyone's work being silently lost. syncsim
implements that merge several ways and lets you watch each one succeed or fail
under a hostile network: delayed, dropped, duplicated and reordered messages,
partitions, and clocks that lie.

## Layout

| Path | What it is |
|---|---|
| `packages/engine` | The sync engine: clocks, operation log, replicas, merge strategies, simulated network. No UI code. |
| `apps/playground` | React app that drives the engine visually. Deployed to GitHub Pages. |

## Commands

```bash
npm install
npm run dev        # playground at http://localhost:5173/syncsim/
npm test           # engine tests
npm run typecheck  # engine type check
npm run build      # production build of the playground
```

## Docs

- [Approach](docs/APPROACH.md): how it works, the trade-offs, and where it would break in production
- [Plan](docs/PLAN.md): goals, ground rules, milestones and their status
- [Journal](docs/JOURNAL.md): problems we hit and how we resolved them
