import { useEffect, useState } from 'react'
import { SimulatorView } from './components/SimulatorView'

type Theme = 'dark' | 'light'
const THEME_KEY = 'syncsim_theme'

function App() {
  const [theme, setTheme] = useTheme()

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

      <SimulatorView />
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
