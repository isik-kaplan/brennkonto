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

// Converts an ISO datetime string ("YYYY-MM-DDTHH:MM:SS") to the value a single
// <input type="datetime-local"> expects ("YYYY-MM-DDTHH:MM") - just the seconds dropped.
export function toDatetimeLocalValue(value: string): string {
  return value.slice(0, 16)
}

// HH:MM straight out of the naive ISO string, for showing an entry's logged time in the list -
// a plain slice rather than a `new Date()` parse, matching toDatetimeLocalValue's approach so it
// can't drift on timezone parsing quirks for a string that was never meant to carry one.
export function displayTime(value: string): string {
  return value.slice(11, 16)
}

// Inverse of toDatetimeLocalValue - appends the seconds back on for the backend.
export function fromDatetimeLocalValue(value: string): string {
  return `${value}:00`
}
