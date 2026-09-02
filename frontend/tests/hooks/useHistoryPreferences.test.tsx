import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_HISTORY_PREFERENCES, useHistoryPreferences } from '../../src/hooks/useHistoryPreferences'

const STORAGE_KEY = 'brennkonto-history-prefs'

describe('useHistoryPreferences', () => {
  it('defaults to every metric active, amounts hidden, and a month range when nothing is stored', () => {
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences).toEqual(DEFAULT_HISTORY_PREFERENCES)
  })

  it('picks up a previously stored value on mount', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeMetrics: ['protein', 'fat'], showAmounts: true, aggregateRangePreset: 'week' })
    )
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences).toEqual({
      activeMetrics: ['protein', 'fat'],
      showAmounts: true,
      aggregateRangePreset: 'week',
    })
  })

  it('setPreferences updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useHistoryPreferences())
    const next = { activeMetrics: ['calories' as const], showAmounts: true, aggregateRangePreset: '6months' as const }

    act(() => result.current.setPreferences(next))

    expect(result.current.preferences).toEqual(next)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(next)
  })

  it('falls back to defaults when the stored value is not valid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences).toEqual(DEFAULT_HISTORY_PREFERENCES)
  })

  it('falls back to defaults when the stored value is not an object', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('a string'))
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences).toEqual(DEFAULT_HISTORY_PREFERENCES)
  })

  it('falls back to defaults when the stored value parses to null', () => {
    localStorage.setItem(STORAGE_KEY, 'null')
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences).toEqual(DEFAULT_HISTORY_PREFERENCES)
  })

  it('drops unknown metric keys and falls back per-field for a malformed shape', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeMetrics: ['protein', 'sepia', 42], showAmounts: 'yes', aggregateRangePreset: 'decade' })
    )
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences).toEqual({
      activeMetrics: ['protein'],
      showAmounts: DEFAULT_HISTORY_PREFERENCES.showAmounts,
      aggregateRangePreset: DEFAULT_HISTORY_PREFERENCES.aggregateRangePreset,
    })
  })

  it('falls back to the default active metrics when activeMetrics is missing entirely', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showAmounts: true }))
    const { result } = renderHook(() => useHistoryPreferences())
    expect(result.current.preferences.activeMetrics).toEqual(DEFAULT_HISTORY_PREFERENCES.activeMetrics)
    expect(result.current.preferences.showAmounts).toBe(true)
  })
})
