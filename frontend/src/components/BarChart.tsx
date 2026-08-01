interface BarChartPoint {
  label: string
  value: number
}

interface BarChartProps {
  points: BarChartPoint[]
  goal?: number
}

const BAR_WIDTH = 34
const GAP = 18
const HEIGHT = 200
const TOP_PADDING = 24

export default function BarChart({ points, goal }: BarChartProps) {
  if (points.length === 0) {
    return <div className="empty-state">No entries in this range yet.</div>
  }

  const maxValue = Math.max(...points.map((point) => point.value), goal ?? 0, 1)
  const scale = (HEIGHT - TOP_PADDING) / (maxValue * 1.1)
  const width = points.length * (BAR_WIDTH + GAP) + GAP

  const goalY = goal ? HEIGHT - goal * scale : null

  return (
    <div className="chart">
      <svg className="chart__svg" viewBox={`0 0 ${width} ${HEIGHT + 24}`} preserveAspectRatio="xMinYMid meet">
        {goalY !== null && (
          <line className="chart__bar-goal" x1={0} x2={width} y1={goalY} y2={goalY} />
        )}
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
    </div>
  )
}
