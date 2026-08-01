import { formattedDate } from '@isik-kaplan/core'

// Local-calendar-day ISO string (YYYY-MM-DD) - deliberately not `Date#toISOString()`, which
// reports the UTC day and would silently roll a late-evening entry onto tomorrow's log for
// anyone west of UTC.
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(value: string, amount: number): string {
  const date = fromISODate(value)
  date.setDate(date.getDate() + amount)
  return toISODate(date)
}

export function displayDate(value: string): string {
  return formattedDate('EEE, d MMM', fromISODate(value))
}

export function displayDateLong(value: string): string {
  return formattedDate('EEEE, d MMMM yyyy', fromISODate(value))
}
