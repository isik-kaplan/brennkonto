import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FoodEntry } from '../../src/api/types'
import EntryList from '../../src/components/EntryList'

function makeEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: 1,
    name: 'Banana',
    brand: 'Chiquita',
    barcode: '123',
    grams: 120,
    input_unit: 'g',
    input_amount: 120,
    unit_to_grams: 1,
    calories_per_100g: 89,
    protein_per_100g: 1.1,
    carbs_per_100g: 22.8,
    fat_per_100g: 0.3,
    calories: 106.8,
    protein_g: 1.32,
    carbs_g: 27.36,
    fat_g: 0.36,
    consumed_at: '2026-08-01',
    created_at: '2026-08-01T12:00:00Z',
    ...overrides,
  }
}

describe('EntryList', () => {
  it('shows the default empty message when there are no entries', () => {
    render(<EntryList entries={[]} onDelete={vi.fn()} />)
    expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument()
  })

  it('shows a custom empty message when provided', () => {
    render(<EntryList entries={[]} onDelete={vi.fn()} emptyMessage="Nothing today." />)
    expect(screen.getByText('Nothing today.')).toBeInTheDocument()
  })

  it('renders an entry with brand, grams, macros, and calories', () => {
    render(<EntryList entries={[makeEntry()]} onDelete={vi.fn()} />)
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.getByText(/Chiquita/)).toBeInTheDocument()
    expect(screen.getByText(/120g/)).toBeInTheDocument()
    expect(screen.getByText(/P1 C27 F0/)).toBeInTheDocument()
    expect(screen.getByText('107 kcal')).toBeInTheDocument()
  })

  it('renders an entry without a brand', () => {
    render(<EntryList entries={[makeEntry({ brand: null })]} onDelete={vi.fn()} />)
    expect(screen.getByText(/^120g/)).toBeInTheDocument()
  })

  it('annotates a non-gram entry with its grams equivalent', () => {
    render(<EntryList entries={[makeEntry({ input_unit: 'count', input_amount: 2, grams: 106 })]} onDelete={vi.fn()} />)
    expect(screen.getByText(/2 count \(≈106g\)/)).toBeInTheDocument()
  })

  it('calls onDelete with the entry when Remove is clicked', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const entry = makeEntry()
    render(<EntryList entries={[entry]} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
    expect(onDelete).toHaveBeenCalledWith(entry)
  })

  it('shows a spinner and disables the button for the entry being deleted', () => {
    const entry = makeEntry()
    render(<EntryList entries={[entry]} onDelete={vi.fn()} deletingId={entry.id} />)
    const button = screen.getByRole('button', { name: 'Delete Banana' })
    expect(button).toBeDisabled()
    expect(button.querySelector('.btn__spinner')).toBeInTheDocument()
  })
})
