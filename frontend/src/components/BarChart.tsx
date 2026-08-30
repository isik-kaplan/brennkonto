interface BarChartBar {
  key: string
  value: number
  /** CSS custom property name (e.g. "--color-accent") used to color this one bar. */
  colorVar: string
  /** Optional formatted value (e.g. "1,840 kcal") printed above the bar, rotated to fit a
   * narrow grouped bar. The bar's height/scale is unaffected - this is a label, not a value. */
  amountLabel?: string
}

interface BarChartPoint {
  label: string
  /** Single-series shorthand - renders one full-width bar in the default accent color. */
  value?: number
  /** Multiple named bars sharing this point's slot, e.g. one per toggled-on metric. */
  bars?: BarChartBar[]
}

interface BarChartProps {
  points: BarChartPoint[]
  goal?: number
  /** True when there's too little real data yet to fill the chart meaningfully (e.g. a new
   * user's first few days) - widens the chart to a minimum width and fills it with a decorative
   * squiggle so it doesn't render as a stark, half-empty grid. */
  sparse?: boolean
}

const BAR_WIDTH = 34
const GROUP_BAR_WIDTH = 10
const GROUP_GAP = 4
const GAP = 18
const HEIGHT = 200
const TOP_PADDING = 24
// Amount labels run vertically above their bar (see the rotated <text> below) - they need much
// more headroom than the plain top padding gives a label-less chart.
const TOP_PADDING_WITH_LABELS = 64
const MIN_PLACEHOLDER_SLOTS = 6

// Deterministic, not Math.random() - a sum of a few sine waves at different frequencies and
// phases reads as an organic, hand-drawn squiggle rather than a clean sinusoid, and stays
// stable across re-renders instead of jumping around every time the component redraws.
function squigglePath(width: number, height: number): string {
  const steps = 48
  const mid = height / 2
  const parts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = t * width
    const y =
      mid +
      Math.sin(t * Math.PI * 2.4) * height * 0.24 +
      Math.sin(t * Math.PI * 6.1 + 1.3) * height * 0.11 +
      Math.sin(t * Math.PI * 13 + 0.4) * height * 0.05
    const clamped = Math.min(Math.max(y, height * 0.06), height * 0.94)
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${clamped.toFixed(1)}`)
  }
  return parts.join(' ')
}

// A point with no `bars` falls back to its single `value` as one full-width bar - this is what
// keeps the single-series call sites (e.g. Trends' calorie chart) unchanged.
function barsOf(point: BarChartPoint): BarChartBar[] {
  if (point.bars) return point.bars
  if (point.value !== undefined) return [{ key: 'default', value: point.value, colorVar: '' }]
  return []
}

function groupWidthFor(barCount: number): number {
  return barCount > 1 ? barCount * GROUP_BAR_WIDTH + (barCount - 1) * GROUP_GAP : BAR_WIDTH
}

export default function BarChart({ points, goal, sparse = false }: BarChartProps) {
  const showPlaceholder = sparse || points.length === 0
  const slots = showPlaceholder ? Math.max(points.length, MIN_PLACEHOLDER_SLOTS) : points.length

  const maxBarsPerPoint = points.reduce((max, point) => Math.max(max, barsOf(point).length), 1)
  const groupWidth = groupWidthFor(maxBarsPerPoint)
  const width = slots * (groupWidth + GAP) + GAP

  const allBars = points.flatMap((point) => barsOf(point))
  const maxValue = Math.max(...allBars.map((bar) => bar.value), goal ?? 0, 1)
  const hasAmountLabels = allBars.some((bar) => bar.amountLabel)
  const topPadding = hasAmountLabels ? TOP_PADDING_WITH_LABELS : TOP_PADDING
  const scale = (HEIGHT - topPadding) / (maxValue * 1.1)
  const goalY = goal ? HEIGHT - goal * scale : null

  return (
    <div className="chart">
      <svg className="chart__svg" viewBox={`0 0 ${width} ${HEIGHT + 24}`} preserveAspectRatio="xMinYMid meet">
        {showPlaceholder && <path className="chart__placeholder" d={squigglePath(width, HEIGHT)} />}
        {goalY !== null && <line className="chart__bar-goal" x1={0} x2={width} y1={goalY} y2={goalY} />}
        {points.map((point, index) => {
          const bars = barsOf(point)
          const barWidth = bars.length > 1 ? GROUP_BAR_WIDTH : BAR_WIDTH
          const slotX = GAP + index * (groupWidth + GAP)
          return (
            <g key={`${point.label}-${index}`}>
              {bars.map((bar, barIndex) => {
                const barHeight = Math.max(bar.value * scale, 1)
                const x = slotX + barIndex * (barWidth + GROUP_GAP)
                const y = HEIGHT - barHeight
                const labelAnchorX = x + barWidth / 2
                const labelAnchorY = y - 4
                return (
                  <g key={bar.key}>
                    <rect
                      className="chart__bar"
                      style={bar.colorVar ? { fill: `var(${bar.colorVar})` } : undefined}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                    />
                    {bar.amountLabel && (
                      <text
                        x={labelAnchorX}
                        y={labelAnchorY}
                        textAnchor="start"
                        transform={`rotate(-90 ${labelAnchorX} ${labelAnchorY})`}
                        className="chart__bar-amount numeral"
                      >
                        {bar.amountLabel}
                      </text>
                    )}
                  </g>
                )
              })}
              <text x={slotX + groupWidth / 2} y={HEIGHT + 16} textAnchor="middle" className="chart__axis-label">
                {point.label}
              </text>
            </g>
          )
        })}
      </svg>
      {points.length === 0 && <p className="chart__empty-hint">No entries in this range yet.</p>}
    </div>
  )
}
