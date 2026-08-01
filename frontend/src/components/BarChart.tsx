interface BarChartPoint {
  label: string
  value: number
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
const GAP = 18
const HEIGHT = 200
const TOP_PADDING = 24
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

export default function BarChart({ points, goal, sparse = false }: BarChartProps) {
  const showPlaceholder = sparse || points.length === 0
  const slots = showPlaceholder ? Math.max(points.length, MIN_PLACEHOLDER_SLOTS) : points.length
  const width = slots * (BAR_WIDTH + GAP) + GAP

  const maxValue = Math.max(...points.map((point) => point.value), goal ?? 0, 1)
  const scale = (HEIGHT - TOP_PADDING) / (maxValue * 1.1)
  const goalY = goal ? HEIGHT - goal * scale : null

  return (
    <div className="chart">
      <svg className="chart__svg" viewBox={`0 0 ${width} ${HEIGHT + 24}`} preserveAspectRatio="xMinYMid meet">
        {showPlaceholder && <path className="chart__placeholder" d={squigglePath(width, HEIGHT)} />}
        {goalY !== null && <line className="chart__bar-goal" x1={0} x2={width} y1={goalY} y2={goalY} />}
        {points.map((point, index) => {
          const barHeight = Math.max(point.value * scale, 1)
          const x = GAP + index * (BAR_WIDTH + GAP)
          const y = HEIGHT - barHeight
          return (
            <g key={`${point.label}-${index}`}>
              <rect className="chart__bar" x={x} y={y} width={BAR_WIDTH} height={barHeight} />
              <text x={x + BAR_WIDTH / 2} y={HEIGHT + 16} textAnchor="middle" className="chart__axis-label">
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
