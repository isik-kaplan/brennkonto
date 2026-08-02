import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FoodEntry, MealGroup } from '../../src/api/types'
import EntryList from '../../src/components/EntryList'
import { dragEntryOnto, stubRects } from '../testUtils/dragAndDrop'

function makeEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: '1',
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
    consumed_at: '2026-08-01T12:00:00',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: null,
    meal_group_id: 'g1',
    deleted_at: null,
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

  it('renders an entry with its logged time, brand, grams, macros, and calories', () => {
    render(<EntryList entries={[makeEntry()]} onDelete={vi.fn()} />)
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText(/Chiquita/)).toBeInTheDocument()
    expect(screen.getByText(/120g/)).toBeInTheDocument()
    expect(screen.getByText(/P1 C27 F0/)).toBeInTheDocument()
    expect(screen.getByText('107 kcal')).toBeInTheDocument()
  })

  it('renders an entry without a brand, leaving no stray separator behind', () => {
    const { container } = render(<EntryList entries={[makeEntry({ brand: null })]} onDelete={vi.fn()} />)
    expect(container.querySelector('.entry-row__meta')).toHaveTextContent(/^12:00 · 120g/)
  })

  it('annotates a non-gram entry with its grams equivalent', () => {
    render(<EntryList entries={[makeEntry({ input_unit: 'count', input_amount: 2, grams: 106 })]} onDelete={vi.fn()} />)
    expect(screen.getByText(/2 count \(≈106g\)/)).toBeInTheDocument()
  })

  it('asks for confirmation before calling onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const entry = makeEntry()
    render(<EntryList entries={[entry]} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onDelete).toHaveBeenCalledWith(entry)
  })

  it('cancels the delete confirmation without calling onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<EntryList entries={[makeEntry()]} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove this entry?')).not.toBeInTheDocument()
  })

  it('shows a spinner and disables the button for the entry being deleted', () => {
    const entry = makeEntry()
    render(<EntryList entries={[entry]} onDelete={vi.fn()} deletingId={entry.id} />)
    const button = screen.getByRole('button', { name: 'Delete Banana' })
    expect(button).toBeDisabled()
    expect(button.querySelector('.btn__spinner')).toBeInTheDocument()
  })

  describe('grouping', () => {
    it('clusters entries sharing a meal_group_id under a named header with an ungroup action', async () => {
      const user = userEvent.setup()
      const onUngroup = vi.fn()
      const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1', '2'] }]
      const entries = [
        makeEntry({ id: '1', name: 'Eggs', meal_group_id: 'g1' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g1' }),
      ]
      render(<EntryList entries={entries} onDelete={vi.fn()} groups={groups} onUngroup={onUngroup} />)

      expect(screen.getByText('Breakfast')).toBeInTheDocument()
      expect(screen.getByText('Eggs')).toBeInTheDocument()
      expect(screen.getByText('Toast')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Ungroup' }))
      expect(onUngroup).toHaveBeenCalledWith('g1')
    })

    it('boxes a lone unnamed entry too, with a placeholder to name it', () => {
      const entries = [makeEntry({ id: '1', meal_group_id: 'g2' })]
      const { container } = render(<EntryList entries={entries} onDelete={vi.fn()} onRenameGroup={vi.fn()} />)
      expect(container.querySelector('.meal-group')).toBeInTheDocument()
      expect(screen.getByText('Name this meal')).toBeInTheDocument()
    })

    it('shows the real name instead of the placeholder once a group has one', () => {
      const groups: MealGroup[] = [{ id: 'g2', name: 'Second breakfast', entry_ids: ['1'] }]
      const entries = [makeEntry({ id: '1', meal_group_id: 'g2' })]
      const { container } = render(<EntryList entries={entries} onDelete={vi.fn()} groups={groups} />)
      expect(container.querySelector('.meal-group')).toBeInTheDocument()
      expect(screen.getByText('Second breakfast')).toBeInTheDocument()
    })

    it('renames a boxed group by clicking its name', async () => {
      const user = userEvent.setup()
      const onRenameGroup = vi.fn()
      const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1', '2'] }]
      const entries = [
        makeEntry({ id: '1', name: 'Eggs', meal_group_id: 'g1' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g1' }),
      ]
      render(<EntryList entries={entries} onDelete={vi.fn()} groups={groups} onRenameGroup={onRenameGroup} />)

      await user.click(screen.getByText('Breakfast'))
      const input = screen.getByDisplayValue('Breakfast')
      await user.clear(input)
      await user.type(input, 'Brunch{Enter}')

      expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Brunch')
    })

    it('starts a rename with an empty value for a multi-member group with no name yet', async () => {
      const user = userEvent.setup()
      const onRenameGroup = vi.fn()
      const entries = [
        makeEntry({ id: '1', name: 'Eggs', meal_group_id: 'g1' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g1' }),
      ]
      const { container } = render(<EntryList entries={entries} onDelete={vi.fn()} onRenameGroup={onRenameGroup} />)

      const header = container.querySelector('.meal-group__header span[role="button"]')!
      await user.click(header)
      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('')
      await user.type(input, 'Breakfast{Enter}')

      expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Breakfast')
    })

    it('renames a lone entry by clicking its placeholder header', async () => {
      const user = userEvent.setup()
      const onRenameGroup = vi.fn()
      const entries = [makeEntry({ id: '1', meal_group_id: 'g2' })]
      render(<EntryList entries={entries} onDelete={vi.fn()} onRenameGroup={onRenameGroup} />)

      await user.click(screen.getByText('Name this meal'))
      const input = screen.getByRole('textbox')
      await user.type(input, 'Second breakfast')
      fireEvent.blur(input)

      expect(onRenameGroup).toHaveBeenCalledWith('g2', 'Second breakfast')
    })

    it('cancels a rename with Escape without calling onRenameGroup', async () => {
      const user = userEvent.setup()
      const onRenameGroup = vi.fn()
      const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1'] }]
      const entries = [makeEntry({ id: '1', meal_group_id: 'g1' })]
      render(<EntryList entries={entries} onDelete={vi.fn()} groups={groups} onRenameGroup={onRenameGroup} />)

      await user.click(screen.getByText('Breakfast'))
      await user.keyboard('{Escape}')

      expect(onRenameGroup).not.toHaveBeenCalled()
      expect(screen.getByText('Breakfast')).toBeInTheDocument()
    })

    it('a named group header is not clickable when onRenameGroup is not provided', async () => {
      const user = userEvent.setup()
      const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1', '2'] }]
      const entries = [
        makeEntry({ id: '1', name: 'Eggs', meal_group_id: 'g1' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g1' }),
      ]
      render(<EntryList entries={entries} onDelete={vi.fn()} groups={groups} />)

      await user.click(screen.getByText('Breakfast'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('does not show an Edit button when onUpdateConsumedAt is not provided', () => {
    render(<EntryList entries={[makeEntry()]} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Edit when Banana was logged' })).not.toBeInTheDocument()
  })

  it('edits the consumed-at date and time, pre-filled from the entry', async () => {
    const user = userEvent.setup()
    const onUpdateConsumedAt = vi.fn()
    const entry = makeEntry({ consumed_at: '2026-08-01T09:15:00' })
    render(<EntryList entries={[entry]} onDelete={vi.fn()} onUpdateConsumedAt={onUpdateConsumedAt} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    expect(screen.getByLabelText('Logged at')).toHaveValue('2026-08-01T09:15')

    fireEvent.change(screen.getByLabelText('Logged at'), { target: { value: '2026-08-02T13:30' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onUpdateConsumedAt).toHaveBeenCalledWith(entry, '2026-08-02T13:30:00')
    expect(screen.queryByLabelText('Logged at')).not.toBeInTheDocument()
  })

  it('cancels editing without calling onUpdateConsumedAt', async () => {
    const user = userEvent.setup()
    const onUpdateConsumedAt = vi.fn()
    render(<EntryList entries={[makeEntry()]} onDelete={vi.fn()} onUpdateConsumedAt={onUpdateConsumedAt} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onUpdateConsumedAt).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Logged at')).not.toBeInTheDocument()
  })

  // Runs last in this file - @dnd-kit defers some of its internal document-listener cleanup by
  // 50ms after a drag ends, which has been observed to bleed into whichever test runs right
  // after a drag simulation.
  it('drags one entry onto another to merge them, and is a no-op onto its own group', () => {
    const onMoveEntry = vi.fn()
    const entries = [
      makeEntry({ id: '1', name: 'Banana', meal_group_id: 'g1' }),
      makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g2' }),
    ]
    render(<EntryList entries={entries} onDelete={vi.fn()} onMoveEntry={onMoveEntry} />)

    const banana = screen.getByText('Banana').closest('li')!
    const toast = screen.getByText('Toast').closest('li')!
    stubRects(banana, toast)

    dragEntryOnto(banana, toast)
    expect(onMoveEntry).toHaveBeenCalledWith(entries[0], 'g2')

    onMoveEntry.mockClear()
    dragEntryOnto(banana, banana)
    expect(onMoveEntry).not.toHaveBeenCalled()

    onMoveEntry.mockClear()
    const nowhere = document.createElement('div')
    nowhere.getBoundingClientRect = () =>
      ({
        top: 9999,
        bottom: 10049,
        left: 9999,
        right: 10299,
        width: 300,
        height: 50,
        x: 9999,
        y: 9999,
        toJSON() {},
      }) as DOMRect
    dragEntryOnto(banana, nowhere)
    expect(onMoveEntry).not.toHaveBeenCalled()
  })
})
