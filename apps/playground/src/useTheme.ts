import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

/** Shared by every page, so a theme chosen on one page applies on the others. */
const THEME_KEY = 'syncsim_theme'

/** Dark or light theme, applied to `<html data-theme>` and remembered across visits. */
export function useTheme() {
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
