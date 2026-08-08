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
