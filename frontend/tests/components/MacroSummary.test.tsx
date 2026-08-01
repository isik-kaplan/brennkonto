import { fc, test } from '@fast-check/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MacroSummary from '../../src/components/MacroSummary'

const baseProps = {
  calories: 500,
  calorieGoal: 2000,
  protein: 30,
  proteinGoal: 150,
  carbs: 40,
  carbsGoal: 200,
  fat: 10,
  fatGoal: 65,
}

describe('MacroSummary', () => {
  it('renders remaining calories when under goal', () => {
    render(<MacroSummary {...baseProps} />)
    expect(screen.getByText('1500 left')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('renders an over-budget state with the negative modifier', () => {
    render(<MacroSummary {...baseProps} calories={2500} />)
    expect(screen.getByText('500 over')).toBeInTheDocument()
    const valueCircle = document.querySelector('.calorie-ring__value')
    expect(valueCircle).toHaveClass('is-over')
  })

  it('renders macro bar labels and values', () => {
    render(<MacroSummary {...baseProps} />)
    expect(screen.getByText('Protein')).toBeInTheDocument()
    expect(screen.getByText('30 / 150g')).toBeInTheDocument()
    expect(screen.getByText('Carbs')).toBeInTheDocument()
    expect(screen.getByText('Fat')).toBeInTheDocument()
  })

  it('treats a zero calorie goal as 0% progress instead of dividing by zero', () => {
    render(<MacroSummary {...baseProps} calorieGoal={0} calories={0} />)
    const valueCircle = document.querySelector('.calorie-ring__value') as SVGCircleElement
    expect(valueCircle.getAttribute('stroke-dashoffset')).toBe(String(2 * Math.PI * 45))
  })

  test.prop([
    fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
    fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  ])('macro bar fill width is always clamped to [0, 100]%', (value, goal) => {
    render(<MacroSummary {...baseProps} protein={value} proteinGoal={goal} />)
    const fill = document.querySelector('.macro-bar__fill--protein') as HTMLDivElement
    const width = parseFloat(fill.style.width)
    expect(width).toBeGreaterThanOrEqual(0)
    expect(width).toBeLessThanOrEqual(100)
  })
})
