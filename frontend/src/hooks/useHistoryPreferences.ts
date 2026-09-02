import { useCallback, useState } from 'react'

import type { MetricKey } from '../lib/metrics'
import { METRICS } from '../lib/metrics'
import type { RangePresetKey } from '../lib/rangePresets'
import { isRangePresetKey } from '../lib/rangePresets'

const STORAGE_KEY = 'brennkonto-history-prefs'

export interface HistoryPreferences {
  // Which metrics the trend chart shows before the user touches a toggle.
  activeMetrics: MetricKey[]
  // Whether the trend chart starts with logged amounts labeled on its bars.
  showAmounts: boolean
  // Which preset the Range summary section starts on.
  aggregateRangePreset: RangePresetKey
}

export const DEFAULT_HISTORY_PREFERENCES: HistoryPreferences = {
  activeMetrics: METRICS.map((metric) => metric.key),
  showAmounts: false,
  aggregateRangePreset: 'month',
}

function isMetricKey(value: unknown): value is MetricKey {
  return typeof value === 'string' && METRICS.some((metric) => metric.key === value)
}

// Reads localStorage defensively - a hand-edited or stale-shaped value (an older app version, a
// tampered devtools edit) should fall back to the built-in defaults instead of crashing the page.
function readStoredPreferences(): HistoryPreferences {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_HISTORY_PREFERENCES

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_HISTORY_PREFERENCES
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_HISTORY_PREFERENCES
  const candidate = parsed as Partial<Record<keyof HistoryPreferences, unknown>>

  return {
    activeMetrics: Array.isArray(candidate.activeMetrics)
      ? candidate.activeMetrics.filter(isMetricKey)
      : DEFAULT_HISTORY_PREFERENCES.activeMetrics,
    showAmounts:
      typeof candidate.showAmounts === 'boolean' ? candidate.showAmounts : DEFAULT_HISTORY_PREFERENCES.showAmounts,
    aggregateRangePreset: isRangePresetKey(candidate.aggregateRangePreset)
      ? candidate.aggregateRangePreset
      : DEFAULT_HISTORY_PREFERENCES.aggregateRangePreset,
  }
}

// Deliberately not a React context - unlike theme, these preferences only ever matter at the
// moment History or Settings mounts (they seed initial state, not live-shared UI), so a plain
// localStorage-backed hook that each page reads independently is enough. Settings writes it;
// History reads it once on mount and owns its own state from there.
export function useHistoryPreferences() {
  const [preferences, setPreferencesState] = useState<HistoryPreferences>(readStoredPreferences)

  const setPreferences = useCallback((next: HistoryPreferences) => {
    setPreferencesState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  return { preferences, setPreferences }
}
