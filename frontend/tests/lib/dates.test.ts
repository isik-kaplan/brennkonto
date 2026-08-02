import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'

import {
  addDays,
  combineDateAndTime,
  displayDate,
  displayDateLong,
  fromDatetimeLocalValue,
  fromISODate,
  toDatetimeLocalValue,
  toISODate,
  toISOTime,
} from '../../src/lib/dates'

const dateArb = fc.date({ min: new Date(2000, 0, 1), max: new Date(2099, 11, 31), noInvalidDate: true })

describe('toISODate / fromISODate', () => {
  test.prop([dateArb])('round-trips through fromISODate(toISODate(date))', (date) => {
    const iso = toISODate(date)
    expect(toISODate(fromISODate(iso))).toBe(iso)
  })

  it('zero-pads single-digit month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('does not roll over to the next UTC day for a late-evening local time', () => {
    const date = new Date(2026, 6, 31, 23, 45)
    expect(toISODate(date)).toBe('2026-07-31')
  })
})

describe('addDays', () => {
  test.prop([dateArb])('adding 0 days is a no-op', (date) => {
    const iso = toISODate(date)
    expect(addDays(iso, 0)).toBe(iso)
  })

  test.prop([
    fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31), noInvalidDate: true }),
    fc.integer({ min: -100, max: 100 }),
    fc.integer({ min: -100, max: 100 }),
  ])('composes: addDays(addDays(x, a), b) === addDays(x, a + b)', (date, a, b) => {
    const iso = toISODate(date)
    expect(addDays(addDays(iso, a), b)).toBe(addDays(iso, a + b))
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles negative offsets, including into a shorter month', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('displayDate / displayDateLong', () => {
  it('formats a short display date', () => {
    expect(displayDate('2026-08-01')).toBe('Sat, 1 Aug')
  })

  it('formats a long display date', () => {
    expect(displayDateLong('2026-08-01')).toBe('Saturday, 1 August 2026')
  })
})

describe('toISOTime', () => {
  it('zero-pads single-digit hours and minutes', () => {
    expect(toISOTime(new Date(2026, 0, 5, 9, 5))).toBe('09:05')
  })

  it('formats an afternoon time', () => {
    expect(toISOTime(new Date(2026, 0, 5, 13, 45))).toBe('13:45')
  })
})

describe('combineDateAndTime', () => {
  it('combines a date and time into an ISO-shaped string', () => {
    expect(combineDateAndTime('2026-08-01', '13:45')).toBe('2026-08-01T13:45:00')
  })
})

describe('toDatetimeLocalValue / fromDatetimeLocalValue', () => {
  it('strips seconds for a datetime-local input value', () => {
    expect(toDatetimeLocalValue('2026-08-01T13:45:00')).toBe('2026-08-01T13:45')
  })

  it('strips microseconds too', () => {
    expect(toDatetimeLocalValue('2026-08-01T13:45:00.000000')).toBe('2026-08-01T13:45')
  })

  it('adds seconds back for the backend', () => {
    expect(fromDatetimeLocalValue('2026-08-01T13:45')).toBe('2026-08-01T13:45:00')
  })

  it('round-trips to -> from', () => {
    expect(fromDatetimeLocalValue(toDatetimeLocalValue('2026-08-01T09:30:00'))).toBe('2026-08-01T09:30:00')
  })
})
