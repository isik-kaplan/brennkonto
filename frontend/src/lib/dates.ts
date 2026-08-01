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

// HH:MM, local wall-clock time, for pre-filling a <input type="time"> from `new Date()`.
export function toISOTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Combines a date input's value ("YYYY-MM-DD") and a time input's value ("HH:MM") into the ISO
// datetime string the backend's `consumed_at` field expects - deliberately naive (no timezone
// suffix), matching the rest of the app, which never does real timezone conversion: whatever
// wall-clock time the user picks is stored and read back as literally that time.
export function combineDateAndTime(dateValue: string, timeValue: string): string {
  return `${dateValue}T${timeValue}:00`
}

// Splits an ISO datetime string (as returned by the API) back into separate date/time input
// values - the inverse of combineDateAndTime.
export function splitDateAndTime(value: string): { date: string; time: string } {
  const [date, time] = value.split('T')
  return { date, time: time.slice(0, 5) }
}
