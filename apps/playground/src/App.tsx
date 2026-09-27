import { useEffect, useState } from 'react'
import { Controls } from './components/Controls'
import { Phone } from './components/Phone'
import { Timeline } from './components/Timeline'
import { useSimulation } from './useSimulation'
import { DEVICES, seedFromUrl, writeSeedToUrl } from './world'

type Theme = 'dark' | 'light'
const THEME_KEY = 'syncsim_theme'

function App() {
  const controls = useSimulation({ seed: seedFromUrl(), mode: 'crdt' })
  const { sim, setup, act } = controls
  const [theme, setTheme] = useTheme()

  // Keep the seed in the URL so a run can be shared and replayed.
  useEffect(() => writeSeedToUrl(setup.seed), [setup.seed])

  const inSync = sim.converged()
  // Every phone reports the same conflicts once in sync, so one phone's count is the count.
  const conflicts = sim.replica(DEVICES[0]!.id).conflicts().length

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1 className="wordmark">syncsim</h1>
          <p className="tagline">
            Three phones edit one patient case offline. Break the network, set clocks wrong, and watch how
            each merge strategy copes.
          </p>
        </div>
        <div className="masthead__side">
          <span className={`pill ${inSync ? 'pill--ok' : 'pill--warn'}`} role="status">
            {inSync ? 'All phones in sync' : 'Phones out of sync'}
          </span>
          {inSync && conflicts > 0 && (
            <span className="pill pill--warn">
              {conflicts} open {conflicts === 1 ? 'conflict' : 'conflicts'}
            </span>
          )}
          <span className="mono muted">
            seed {setup.seed} · t = {(sim.now / 1000).toFixed(1)} s
          </span>
          <button
            type="button"
            className="btn btn--small"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="phones">
          {DEVICES.map((d) => (
            <Phone key={d.id} sim={sim} id={d.id} mode={setup.mode} act={act} />
          ))}
        </div>
        <Controls controls={controls} />
        <Timeline sim={sim} />
        <section className="recipes" aria-label="Things to try">
          <h2 className="recipes__title">Things to try</h2>
          <ol>
            <li>
              Take Phone B offline, change the status on A and on B, bring B back. Then flip the merge strategy
              and see which edit survives.
            </li>
            <li>
              Set Phone A’s clock 1 h fast and choose “Device clock wins”. Edit the status on A, wait for a sync,
              then change it on B: A’s older edit still wins.
            </li>
            <li>
              Switch visits and tags to plain values, take two phones offline, and tap +1 visit on each. Only one
              visit survives. With CRDTs, both do.
            </li>
          </ol>
        </section>
      </main>
    </div>
  )
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Storage can be blocked; the theme still applies for this visit.
    }
  }, [theme])
  return [theme, setTheme] as const
}

export default App
