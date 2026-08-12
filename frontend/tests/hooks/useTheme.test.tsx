import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider, useTheme } from '../../src/hooks/useTheme'

const STORAGE_KEY = 'brennkonto-theme'

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

let metaLight: HTMLMetaElement
let metaDark: HTMLMetaElement

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')

  metaLight = document.createElement('meta')
  metaLight.setAttribute('name', 'theme-color')
  metaLight.setAttribute('media', '(prefers-color-scheme: light)')
  metaLight.setAttribute('content', '#f7f0e4')
  document.head.appendChild(metaLight)

  metaDark = document.createElement('meta')
  metaDark.setAttribute('name', 'theme-color')
  metaDark.setAttribute('media', '(prefers-color-scheme: dark)')
  metaDark.setAttribute('content', '#211e1a')
  document.head.appendChild(metaDark)
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  metaLight.remove()
  metaDark.remove()
})

describe('useTheme', () => {
  it('throws when used outside a ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider')
  })

  it('defaults to system with no data-theme attribute when nothing is stored', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(metaLight.getAttribute('content')).toBe('#f7f0e4')
    expect(metaDark.getAttribute('content')).toBe('#211e1a')
  })

  it('picks up a previously stored theme on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(metaLight.getAttribute('content')).toBe('#211e1a')
    expect(metaDark.getAttribute('content')).toBe('#211e1a')
  })

  it('ignores a corrupt stored value and falls back to system', () => {
    localStorage.setItem(STORAGE_KEY, 'sepia')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('system')
  })

  it('setting light persists it and sets the data-theme attribute', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => result.current.setTheme('light'))

    expect(result.current.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(metaLight.getAttribute('content')).toBe('#f7f0e4')
    expect(metaDark.getAttribute('content')).toBe('#f7f0e4')
  })

  it('setting system clears both the attribute and storage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => result.current.setTheme('system'))

    expect(result.current.theme).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(metaLight.getAttribute('content')).toBe('#f7f0e4')
    expect(metaDark.getAttribute('content')).toBe('#211e1a')
  })
})
