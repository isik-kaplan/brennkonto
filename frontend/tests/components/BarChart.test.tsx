import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import BarChart from '../../src/components/BarChart'

describe('BarChart', () => {
  it('shows an empty hint and a placeholder squiggle when there are no points', () => {
    render(<BarChart points={[]} />)
    expect(screen.getByText('No entries in this range yet.')).toBeInTheDocument()
    expect(document.querySelector('.chart__placeholder')).toBeInTheDocument()
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(0)
  })

  it('does not show the placeholder squiggle for a full chart', () => {
    render(
      <BarChart
        points={[
          { label: 'Mon', value: 1800 },
          { label: 'Tue', value: 2200 },
        ]}
      />
    )
    expect(document.querySelector('.chart__placeholder')).not.toBeInTheDocument()
    expect(screen.queryByText('No entries in this range yet.')).not.toBeInTheDocument()
  })

  it('shows the placeholder squiggle alongside real bars when marked sparse', () => {
    render(<BarChart points={[{ label: 'Mon', value: 1800 }]} sparse />)
    expect(document.querySelector('.chart__placeholder')).toBeInTheDocument()
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(1)
  })

  it('renders one bar and one axis label per point', () => {
    render(
      <BarChart
        points={[
          { label: 'Mon', value: 1800 },
          { label: 'Tue', value: 2200 },
        ]}
      />
    )
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(2)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Tue')).toBeInTheDocument()
  })

  it('does not render a goal line when no goal is given', () => {
    render(<BarChart points={[{ label: 'Mon', value: 1800 }]} />)
    expect(document.querySelector('.chart__bar-goal')).not.toBeInTheDocument()
  })

  it('renders a dashed goal line when a goal is given', () => {
    render(<BarChart points={[{ label: 'Mon', value: 1800 }]} goal={2000} />)
    expect(document.querySelector('.chart__bar-goal')).toBeInTheDocument()
  })

  it('gives a zero-value point a visible minimum bar height', () => {
    render(<BarChart points={[{ label: 'Mon', value: 0 }]} />)
    const bar = document.querySelector('.chart__bar') as SVGRectElement
    expect(Number(bar.getAttribute('height'))).toBeGreaterThanOrEqual(1)
  })

  it('gives a taller bar to a larger value', () => {
    render(
      <BarChart
        points={[
          { label: 'Small', value: 100 },
          { label: 'Large', value: 2000 },
        ]}
      />
    )
    const [small, large] = Array.from(document.querySelectorAll('.chart__bar'))
    expect(Number(large.getAttribute('height'))).toBeGreaterThan(Number(small.getAttribute('height')))
  })
})
