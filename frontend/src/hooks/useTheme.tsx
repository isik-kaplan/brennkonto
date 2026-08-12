import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'brennkonto-theme'

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  // The CSS drives the actual colors via `:root[data-theme]` (see tokens.css) - this effect's
  // job is to keep that attribute in sync with the chosen theme and update the PWA theme-color.
  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }

    const metaTags = document.querySelectorAll('meta[name="theme-color"]')
    metaTags.forEach((tag) => {
      const media = tag.getAttribute('media')
      if (theme === 'system') {
        if (media && media.includes('dark')) {
          tag.setAttribute('content', '#211e1a')
        } else {
          tag.setAttribute('content', '#f7f0e4')
        }
      } else {
        tag.setAttribute('content', theme === 'dark' ? '#211e1a' : '#f7f0e4')
      }
    })
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
