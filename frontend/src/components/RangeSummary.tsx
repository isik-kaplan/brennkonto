import { useCallback, useEffect, useState } from 'react'

import { fetchRangeStats } from '../api/endpoints'
import type { RangeStats } from '../api/types'
import { daysBetween, toISODate } from '../lib/dates'
import { RANGE_PRESETS, groupByForDays, presetDateRange } from '../lib/rangePresets'
import type { RangePresetKey } from '../lib/rangePresets'

interface RangeSummaryProps {
  // Which preset the section opens on - Settings' "Range summary default" (useHistoryPreferences).
  defaultPreset: RangePresetKey
}

// A quick pulse-check on an arbitrary range, living next to the day-by-day log. Deliberately
// lighter than the Trends page (which groups by day/week/month, breaks results down per period,
// and compares against the previous period) - this is just "how did I do over range X", with its
// own preset vocabulary (week/2 weeks/month/6 months) tuned for that quicker question.
export default function RangeSummary({ defaultPreset }: RangeSummaryProps) {
  const [preset, setPreset] = useState<RangePresetKey | 'custom'>(defaultPreset)
  const [customStart, setCustomStart] = useState(() => presetDateRange(defaultPreset).start)
  const [customEnd, setCustomEnd] = useState(() => toISODate(new Date()))
  const [stats, setStats] = useState<RangeStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { start, end } = preset === 'custom' ? { start: customStart, end: customEnd } : presetDateRange(preset)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setStats(await fetchRangeStats(start, end, groupByForDays(daysBetween(start, end))))
    } finally {
      setIsLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="card">
      <h2 className="card__title">Range summary</h2>

      <div className="range-controls">
        <div className="segmented" role="group" aria-label="Summary range">
          {RANGE_PRESETS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={preset === option.key ? 'is-active' : ''}
              onClick={() => setPreset(option.key)}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className={preset === 'custom' ? 'is-active' : ''} onClick={() => setPreset('custom')}>
            Custom
          </button>
        </div>

        {preset === 'custom' && (
          <>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="range-summary-start" className="visually-hidden">
                Start date
              </label>
              <input
                id="range-summary-start"
                className="input"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="range-summary-end" className="visually-hidden">
                End date
              </label>
              <input
                id="range-summary-end"
                className="input"
                type="date"
                value={customEnd}
                min={customStart}
                max={toISODate(new Date())}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {isLoading || !stats ? (
        <div className="centered-loader">Loading…</div>
      ) : (
        <div className="stat-strip">
          <div className="stat-tile">
            <div className="stat-tile__label">Avg calories / logged day</div>
            <div className="stat-tile__value">{Math.round(stats.average_calories)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">Avg protein</div>
            <div className="stat-tile__value">{Math.round(stats.average_protein_g)}g</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">Avg carbs</div>
            <div className="stat-tile__value">{Math.round(stats.average_carbs_g)}g</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">Avg fat</div>
            <div className="stat-tile__value">{Math.round(stats.average_fat_g)}g</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">Total calories</div>
            <div className="stat-tile__value">{Math.round(stats.total_calories)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__label">Days logged</div>
            <div className="stat-tile__value">
              {stats.days_logged} / {stats.days_in_range}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
