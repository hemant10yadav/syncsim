import { useEffect, useState } from 'react'
import { SimulatorView } from './components/SimulatorView'
import { LiveView } from './live/LiveView'
import { useTheme } from './useTheme'

type View = 'simulator' | 'live'

function App() {
  const [theme, setTheme] = useTheme()
  const [view, setView] = useView()

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1 className="wordmark">syncsim</h1>
          <p className="tagline">
            Phones edit one patient case offline. Break the network, set clocks wrong, and watch how each merge
            strategy copes.
          </p>
        </div>
        <div className="masthead__side">
          <nav className="segmented" aria-label="View" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <button
              type="button"
              className="segmented__option"
              aria-pressed={view === 'simulator'}
              onClick={() => setView('simulator')}
            >
              Simulator
            </button>
            <button
              type="button"
              className="segmented__option"
              aria-pressed={view === 'live'}
              onClick={() => setView('live')}
            >
              Live tabs
            </button>
          </nav>
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

      {view === 'simulator' ? <SimulatorView /> : <LiveView />}
    </div>
  )
}

/** The current view lives in the URL (`?view=live`) so the live demo can be linked and opened in new tabs. */
function useView() {
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get('view') === 'live' ? 'live' : 'simulator',
  )
  useEffect(() => {
    const url = new URL(window.location.href)
    if (view === 'live') url.searchParams.set('view', 'live')
    else url.searchParams.delete('view')
    window.history.replaceState(null, '', url)
  }, [view])
  return [view, setView] as const
}

export default App
