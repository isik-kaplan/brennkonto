// Shared amount/unit helpers used anywhere an entry's portion is entered or edited (Log Food's
// amount form, History's inline add panel, and the entry list's portion-edit row) - kept in one
// place so the three stay consistent instead of drifting.

// Small amounts (grams/ml) default to a serving-sized 100; larger/discrete units (count, kg, l,
// oz, ...) default to 1 - a default of "100 L" would be absurd.
export function defaultAmountFor(unit: string): string {
  return unit === 'g' || unit === 'ml' ? '100' : '1'
}

export function unitLabel(unit: string): string {
  if (unit === 'g') return 'Amount (grams)'
  if (unit === 'count') return 'How many?'
  return `Amount (${unit})`
}

// Strips a stuck leading zero ("07" -> "7", e.g. from clearing a field down to "0" and typing on)
// without touching a legitimate "0." mid-way through typing a decimal. Shared by every amount field
// so they all clean up input the same way.
export function withoutLeadingZeros(raw: string): string {
  return raw.replace(/^0+(?=\d)/, '')
}
