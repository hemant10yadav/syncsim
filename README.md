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

## Roadmap

1. Hybrid logical clock, operation log, replica, last-write-wins
2. Seeded simulated network and convergence property tests
3. Vector clocks and CRDTs (LWW map, PN-counter, OR-set)
4. Playground: three devices, network controls, message timeline
5. Scenarios, design write-up (`APPROACH.md`), cross-tab sync via BroadcastChannel
