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

  describe('the progress it draws', () => {
    const CIRCUMFERENCE = 2 * Math.PI * 45
    const ringOffset = (container: HTMLElement) =>
      Number(container.querySelector('.calorie-ring__value')!.getAttribute('stroke-dashoffset'))
    const fillWidths = (container: HTMLElement) =>
      [...container.querySelectorAll<HTMLElement>('.macro-bar__fill')].map((bar) => [bar.className, bar.style.width])

    function renderSummary(overrides: Partial<Parameters<typeof MacroSummary>[0]> = {}) {
      return render(
        <MacroSummary
          calories={1000}
          calorieGoal={2000}
          protein={75}
          proteinGoal={150}
          carbs={300}
          carbsGoal={200}
          fat={0}
          fatGoal={70}
          {...overrides}
        />
      )
    }

    it('fills the ring by the share of the goal eaten, and labels it for screen readers', () => {
      const { container } = renderSummary()
      expect(ringOffset(container)).toBeCloseTo(CIRCUMFERENCE / 2)
      expect(screen.getByRole('img')).toHaveAccessibleName('1000 of 2000 calories logged')
    })

    it('fills the ring completely, and no further, once the goal is passed', () => {
      const { container } = renderSummary({ calories: 2600 })
      expect(ringOffset(container)).toBeCloseTo(0)
    })

    it('leaves the ring empty for a zero goal', () => {
      const { container } = renderSummary({ calorieGoal: 0 })
      expect(ringOffset(container)).toBeCloseTo(CIRCUMFERENCE)
    })

    it('is not over budget at exactly the goal', () => {
      const { container } = renderSummary({ calories: 2000 })
      expect(screen.getByText('0 left')).toBeInTheDocument()
      expect(container.querySelector('.calorie-ring__value')).not.toHaveClass('is-over')
    })

    it('fills each macro bar by its share of its goal, capped at full', () => {
      const { container } = renderSummary()
      expect(fillWidths(container)).toEqual([
        ['macro-bar__fill macro-bar__fill--protein', '50%'],
        ['macro-bar__fill macro-bar__fill--carbs', '100%'],
        ['macro-bar__fill macro-bar__fill--fat', '0%'],
      ])
    })
  })
})
