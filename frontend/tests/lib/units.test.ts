import { describe, expect, it } from 'vitest'

import { defaultAmountFor, unitLabel, withoutLeadingZeros } from '../../src/lib/units'

describe('defaultAmountFor', () => {
  it.each([
    ['g', '100'],
    ['ml', '100'],
    ['count', '1'],
    ['kg', '1'],
    ['l', '1'],
  ])('starts %s at %s', (unit, amount) => {
    expect(defaultAmountFor(unit)).toBe(amount)
  })
})

describe('unitLabel', () => {
  it.each([
    ['g', 'Amount (grams)'],
    ['count', 'How many?'],
    ['ml', 'Amount (ml)'],
    ['oz', 'Amount (oz)'],
  ])('labels %s as %j', (unit, label) => {
    expect(unitLabel(unit)).toBe(label)
  })
})

describe('withoutLeadingZeros', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['7', '7'],
    ['07', '7'],
    ['0007', '7'],
    ['100', '100'],
    ['0.5', '0.5'],
    ['00.5', '0.5'],
    ['10.05', '10.05'],
  ])('turns %j into %j', (raw, cleaned) => {
    expect(withoutLeadingZeros(raw)).toBe(cleaned)
  })
})
