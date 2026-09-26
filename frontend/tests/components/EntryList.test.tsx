import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { FoodEntry, MealGroup } from '../../src/api/types'
import EntryList, { applyDrop } from '../../src/components/EntryList'
import { toISODate } from '../../src/lib/dates'
import { dragEntryOnto, stubRects } from '../testUtils/dragAndDrop'

vi.mock('../../src/api/endpoints')

const today = toISODate(new Date())

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

// Every page renders EntryList with all of these - each test overrides whichever it looks at.
function listHandlers() {
  return {
    groups: [] as MealGroup[],
    onMoveEntry: vi.fn(),
    onRenameGroup: vi.fn(),
    onUngroup: vi.fn(),
    onUpdateEntry: vi.fn(),
  }
}

beforeEach(() => {
  vi.mocked(endpoints.createEntry).mockReset()
  vi.mocked(endpoints.createMealGroup).mockReset()
})

describe('EntryList', () => {
  it('shows the default empty message when there are no entries', () => {
    render(<EntryList {...listHandlers()} entries={[]} onDelete={vi.fn()} />)
    expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument()
  })

  it('shows a custom empty message when provided', () => {
    render(<EntryList {...listHandlers()} entries={[]} onDelete={vi.fn()} emptyMessage="Nothing today." />)
    expect(screen.getByText('Nothing today.')).toBeInTheDocument()
  })

  it('renders an entry with its logged time, brand, grams, macros, and calories', () => {
    render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} />)
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText(/Chiquita/)).toBeInTheDocument()
    expect(screen.getByText(/120g/)).toBeInTheDocument()
    expect(screen.getByText(/P1 C27 F0/)).toBeInTheDocument()
    expect(screen.getByText('107 kcal')).toBeInTheDocument()
  })

  it('renders an entry without a brand, leaving no stray separator behind', () => {
    const { container } = render(
      <EntryList {...listHandlers()} entries={[makeEntry({ brand: null })]} onDelete={vi.fn()} />
    )
    expect(container.querySelector('.entry-row__meta')).toHaveTextContent(/^12:00 · 120g/)
  })

  it('annotates a non-gram entry with its grams equivalent', () => {
    render(
      <EntryList
        {...listHandlers()}
        entries={[makeEntry({ input_unit: 'count', input_amount: 2, grams: 106 })]}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText(/2 count \(≈106g\)/)).toBeInTheDocument()
  })

  it('asks for confirmation before calling onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const entry = makeEntry()
    render(<EntryList {...listHandlers()} entries={[entry]} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onDelete).toHaveBeenCalledWith(entry)
  })

  it('cancels the delete confirmation without calling onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove this entry?')).not.toBeInTheDocument()
  })

  it('shows a spinner and disables the button for the entry being deleted', () => {
    const entry = makeEntry()
    render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} deletingId={entry.id} />)
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
      render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} groups={groups} onUngroup={onUngroup} />
      )

      expect(screen.getByText('Breakfast')).toBeInTheDocument()
      expect(screen.getByText('Eggs')).toBeInTheDocument()
      expect(screen.getByText('Toast')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Ungroup' }))
      expect(onUngroup).toHaveBeenCalledWith('g1')
    })

    it('boxes a lone unnamed entry too, with a placeholder to name it', () => {
      const entries = [makeEntry({ id: '1', meal_group_id: 'g2' })]
      const { container } = render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} onRenameGroup={vi.fn()} />
      )
      expect(container.querySelector('.meal-group')).toBeInTheDocument()
      expect(screen.getByText('Name this meal')).toBeInTheDocument()
    })

    it('shows the real name instead of the placeholder once a group has one', () => {
      const groups: MealGroup[] = [{ id: 'g2', name: 'Second breakfast', entry_ids: ['1'] }]
      const entries = [makeEntry({ id: '1', meal_group_id: 'g2' })]
      const { container } = render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} groups={groups} />
      )
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
      render(
        <EntryList
          {...listHandlers()}
          entries={entries}
          onDelete={vi.fn()}
          groups={groups}
          onRenameGroup={onRenameGroup}
        />
      )

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
      const { container } = render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} onRenameGroup={onRenameGroup} />
      )

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
      render(<EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} onRenameGroup={onRenameGroup} />)

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
      render(
        <EntryList
          {...listHandlers()}
          entries={entries}
          onDelete={vi.fn()}
          groups={groups}
          onRenameGroup={onRenameGroup}
        />
      )

      await user.click(screen.getByText('Breakfast'))
      await user.keyboard('{Escape}')

      expect(onRenameGroup).not.toHaveBeenCalled()
      expect(screen.getByText('Breakfast')).toBeInTheDocument()
    })
  })

  it('edits the consumed-at date and time, pre-filled from the entry', async () => {
    const user = userEvent.setup()
    const onUpdateEntry = vi.fn()
    const entry = makeEntry({ consumed_at: '2026-08-01T09:15:00' })
    render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onUpdateEntry={onUpdateEntry} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    expect(screen.getByLabelText('Logged at')).toHaveValue('2026-08-01T09:15')
    expect(screen.getByLabelText('Amount (grams)')).toHaveValue(120)

    fireEvent.change(screen.getByLabelText('Logged at'), { target: { value: '2026-08-02T13:30' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onUpdateEntry).toHaveBeenCalledWith(entry, {
      consumedAt: '2026-08-02T13:30:00',
      grams: 120,
      inputAmount: 120,
    })
    expect(screen.queryByLabelText('Logged at')).not.toBeInTheDocument()
  })

  it('edits the portion, recomputing grams from the amount', async () => {
    const user = userEvent.setup()
    const onUpdateEntry = vi.fn()
    const entry = makeEntry()
    render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onUpdateEntry={onUpdateEntry} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    await user.type(amountInput, '150')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onUpdateEntry).toHaveBeenCalledWith(entry, expect.objectContaining({ grams: 150, inputAmount: 150 }))
  })

  it('recomputes grams from unit_to_grams for a non-gram entry', async () => {
    const user = userEvent.setup()
    const onUpdateEntry = vi.fn()
    const entry = makeEntry({ input_unit: 'count', input_amount: 2, unit_to_grams: 53, grams: 106 })
    render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onUpdateEntry={onUpdateEntry} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    expect(screen.getByLabelText('How many?')).toHaveValue(2)
    const amountInput = screen.getByLabelText('How many?')
    await user.clear(amountInput)
    await user.type(amountInput, '3')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onUpdateEntry).toHaveBeenCalledWith(entry, expect.objectContaining({ grams: 159, inputAmount: 3 }))
  })

  it('disables Save while the amount is cleared to empty', async () => {
    const user = userEvent.setup()
    const onUpdateEntry = vi.fn()
    render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onUpdateEntry={onUpdateEntry} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('does not call onUpdateEntry when submitted with a zero/empty amount, even bypassing native validation', async () => {
    const user = userEvent.setup()
    const onUpdateEntry = vi.fn()
    render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onUpdateEntry={onUpdateEntry} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    // fireEvent.submit dispatches the submit event directly, bypassing the disabled Save button
    // and the input's own min/required constraint validation - same defensive-guard pattern as
    // Log Food's amount form.
    fireEvent.submit(amountInput.closest('form')!)

    expect(onUpdateEntry).not.toHaveBeenCalled()
  })

  it('cancels editing without calling onUpdateEntry', async () => {
    const user = userEvent.setup()
    const onUpdateEntry = vi.fn()
    render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onUpdateEntry={onUpdateEntry} />)

    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onUpdateEntry).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Logged at')).not.toBeInTheDocument()
  })

  describe('repeating a past entry for today', () => {
    it('does not show repeat actions when onEntryRepeated is not provided', () => {
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Repeat Banana today' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Repeat Banana today with a different amount' })
      ).not.toBeInTheDocument()
    })

    it('repeats an entry today with its original amount', async () => {
      const user = userEvent.setup()
      const onEntryRepeated = vi.fn()
      const entry = makeEntry({ consumed_at: '2026-08-01T09:00:00' })
      vi.mocked(endpoints.createEntry).mockResolvedValue(entry)
      render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={onEntryRepeated} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today' }))

      await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalled())
      const [payload] = vi.mocked(endpoints.createEntry).mock.calls[0]
      expect(payload).toMatchObject({
        name: 'Banana',
        brand: 'Chiquita',
        barcode: '123',
        grams: 120,
        input_unit: 'g',
        input_amount: 120,
        unit_to_grams: 1,
        calories_per_100g: 89,
      })
      expect(payload.consumed_at).toMatch(new RegExp(`^${today}T\\d{2}:\\d{2}:00$`))
      expect(await screen.findByRole('button', { name: 'Repeat Banana today' })).toHaveTextContent('Repeated ✓')
      expect(onEntryRepeated).toHaveBeenCalled()

      // Real timers - the 1500ms confirmation window really elapses, same as AddEntryPanel's
      // equivalent "Added ✓" reversion.
      await waitFor(
        () => expect(screen.getByRole('button', { name: 'Repeat Banana today' })).toHaveTextContent('Repeat today'),
        { timeout: 3000 }
      )
    }, 10000)

    it('scales grams from unit_to_grams for a non-gram entry', async () => {
      const user = userEvent.setup()
      const entry = makeEntry({ input_unit: 'count', input_amount: 2, unit_to_grams: 53, grams: 106 })
      vi.mocked(endpoints.createEntry).mockResolvedValue(entry)
      render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today' }))

      await waitFor(() =>
        expect(endpoints.createEntry).toHaveBeenCalledWith(
          expect.objectContaining({ grams: 106, input_unit: 'count', input_amount: 2, unit_to_grams: 53 })
        )
      )
    })

    it('shows an error and leaves the button usable again when the quick repeat fails', async () => {
      const user = userEvent.setup()
      const entry = makeEntry()
      vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Server is down.', 500))
      render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today' }))

      expect(await screen.findByText('Server is down.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Repeat Banana today' })).toHaveTextContent('Repeat today')
      expect(screen.getByRole('button', { name: 'Repeat Banana today' })).toBeEnabled()
    })

    it('falls back to a generic error message for a non-API failure', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today' }))

      expect(await screen.findByText('Could not repeat "Banana".')).toBeInTheDocument()
    })

    it('disables and shows a spinner on the quick action while the request is in flight', async () => {
      const user = userEvent.setup()
      let resolveCreate!: (value: FoodEntry) => void
      vi.mocked(endpoints.createEntry).mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = resolve
        })
      )
      const entry = makeEntry()
      render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today' }))
      const quickButton = screen.getByRole('button', { name: 'Repeat Banana today' })
      expect(quickButton).toBeDisabled()
      expect(quickButton.querySelector('.btn__spinner')).toBeInTheDocument()

      resolveCreate(entry)
      await waitFor(() => expect(quickButton).toBeEnabled())
    })

    it('opens an amount-adjusted repeat form pre-filled from the entry, and cancels without saving', async () => {
      const user = userEvent.setup()
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      expect(screen.getByLabelText('Amount (grams)')).toHaveValue(120)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByLabelText('Amount (grams)')).not.toBeInTheDocument()
      expect(endpoints.createEntry).not.toHaveBeenCalled()
    })

    it('repeats today with an adjusted amount, recomputing grams', async () => {
      const user = userEvent.setup()
      const onEntryRepeated = vi.fn()
      const entry = makeEntry()
      vi.mocked(endpoints.createEntry).mockResolvedValue(entry)
      render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={onEntryRepeated} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      const amountInput = screen.getByLabelText('Amount (grams)')
      await user.clear(amountInput)
      await user.type(amountInput, '150')
      await user.click(screen.getByRole('button', { name: 'Add to today' }))

      await waitFor(() =>
        expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 150, input_amount: 150 }))
      )
      await waitFor(() => expect(screen.queryByLabelText('Amount (grams)')).not.toBeInTheDocument())
      expect(onEntryRepeated).toHaveBeenCalled()
    })

    it('recomputes grams from unit_to_grams when adjusting a non-gram entry', async () => {
      const user = userEvent.setup()
      const entry = makeEntry({ input_unit: 'count', input_amount: 2, unit_to_grams: 53, grams: 106 })
      vi.mocked(endpoints.createEntry).mockResolvedValue(entry)
      render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      const amountInput = screen.getByLabelText('How many?')
      expect(amountInput).toHaveValue(2)
      await user.clear(amountInput)
      await user.type(amountInput, '3')
      await user.click(screen.getByRole('button', { name: 'Add to today' }))

      await waitFor(() =>
        expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 159, input_amount: 3 }))
      )
    })

    it('disables Add to today while the adjusted amount is cleared to empty', async () => {
      const user = userEvent.setup()
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      const amountInput = screen.getByLabelText('Amount (grams)')
      await user.clear(amountInput)

      expect(screen.getByRole('button', { name: 'Add to today' })).toBeDisabled()
    })

    it('does not repeat when submitted with a zero/empty amount, even bypassing native validation', async () => {
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      const amountInput = screen.getByLabelText('Amount (grams)')
      fireEvent.change(amountInput, { target: { value: '' } })
      fireEvent.submit(amountInput.closest('form')!)

      expect(endpoints.createEntry).not.toHaveBeenCalled()
    })

    it('opening the retroactive edit form on one entry closes an open repeat-with-changes form on another', async () => {
      const user = userEvent.setup()
      const onUpdateEntry = vi.fn()
      const entries = [makeEntry({ id: '1', name: 'Banana' }), makeEntry({ id: '2', name: 'Apple' })]
      render(
        <EntryList
          {...listHandlers()}
          entries={entries}
          onDelete={vi.fn()}
          onUpdateEntry={onUpdateEntry}
          onEntryRepeated={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      expect(screen.getByRole('button', { name: 'Add to today' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Edit when Apple was logged' }))
      expect(screen.queryByRole('button', { name: 'Add to today' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    it('opening a repeat-with-changes form on one entry closes an open retroactive edit form on another', async () => {
      const user = userEvent.setup()
      const onUpdateEntry = vi.fn()
      const entries = [makeEntry({ id: '1', name: 'Banana' }), makeEntry({ id: '2', name: 'Apple' })]
      render(
        <EntryList
          {...listHandlers()}
          entries={entries}
          onDelete={vi.fn()}
          onUpdateEntry={onUpdateEntry}
          onEntryRepeated={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Edit when Apple was logged' }))
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add to today' })).toBeInTheDocument()
    })
  })

  describe('repeating a whole meal group for today', () => {
    const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1', '2'] }]
    const entries = [
      makeEntry({ id: '1', name: 'Eggs', meal_group_id: 'g1', input_amount: 100, grams: 100 }),
      makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g1', input_amount: 60, grams: 60 }),
    ]

    it('does not show a group repeat action when onEntryRepeated is not provided', () => {
      render(<EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} groups={groups} />)
      expect(screen.queryByRole('button', { name: /Repeat this meal today/ })).not.toBeInTheDocument()
    })

    it('does not show a group repeat action for a lone boxed entry', () => {
      render(
        <EntryList
          {...listHandlers()}
          entries={[makeEntry({ id: '1', meal_group_id: 'g2' })]}
          onDelete={vi.fn()}
          onEntryRepeated={vi.fn()}
        />
      )
      expect(screen.queryByRole('button', { name: /Repeat this meal today/ })).not.toBeInTheDocument()
    })

    it('repeats every entry and regroups the copies under the same name', async () => {
      const user = userEvent.setup()
      const onEntryRepeated = vi.fn()
      vi.mocked(endpoints.createEntry).mockResolvedValueOnce(entries[0]).mockResolvedValueOnce(entries[1])
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g2', name: 'Breakfast', entry_ids: ['1', '2'] })
      render(
        <EntryList
          {...listHandlers()}
          entries={entries}
          onDelete={vi.fn()}
          groups={groups}
          onEntryRepeated={onEntryRepeated}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' }))

      await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalledTimes(2))
      const [eggsPayload] = vi.mocked(endpoints.createEntry).mock.calls[0]
      const [toastPayload] = vi.mocked(endpoints.createEntry).mock.calls[1]
      expect(eggsPayload).toMatchObject({ name: 'Eggs', grams: 100, input_amount: 100 })
      expect(eggsPayload.consumed_at).toMatch(new RegExp(`^${today}T\\d{2}:\\d{2}:00$`))
      expect(toastPayload).toMatchObject({ name: 'Toast', grams: 60, input_amount: 60 })

      await waitFor(() => expect(endpoints.createMealGroup).toHaveBeenCalledWith(['1', '2'], 'Breakfast'))
      expect(await screen.findByRole('button', { name: 'Repeat this meal today: Breakfast' })).toHaveTextContent(
        'Repeated ✓'
      )
      expect(onEntryRepeated).toHaveBeenCalled()

      // Real timers - same 1500ms confirmation window as the per-entry repeat actions.
      await waitFor(
        () =>
          expect(screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' })).toHaveTextContent(
            'Repeat meal today'
          ),
        { timeout: 3000 }
      )
    }, 10000)

    it('regroups under no name for an unnamed meal', async () => {
      const user = userEvent.setup()
      const unnamedGroups: MealGroup[] = [{ id: 'g1', name: null, entry_ids: ['1', '2'] }]
      vi.mocked(endpoints.createEntry).mockResolvedValueOnce(entries[0]).mockResolvedValueOnce(entries[1])
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g2', name: null, entry_ids: ['1', '2'] })
      render(
        <EntryList
          {...listHandlers()}
          entries={entries}
          onDelete={vi.fn()}
          groups={unnamedGroups}
          onEntryRepeated={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Repeat this meal today' }))

      await waitFor(() => expect(endpoints.createMealGroup).toHaveBeenCalledWith(['1', '2'], null))
    })

    it('shows an error and re-enables the button when repeating the meal fails', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Server is down.', 500))
      render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} groups={groups} onEntryRepeated={vi.fn()} />
      )

      await user.click(screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' }))

      expect(await screen.findByText('Server is down.')).toBeInTheDocument()
      const button = screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' })
      expect(button).toBeEnabled()
      expect(button).toHaveTextContent('Repeat meal today')
      expect(endpoints.createMealGroup).not.toHaveBeenCalled()
    })

    it('falls back to a generic error message when regrouping fails with a non-API error', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.createEntry).mockResolvedValueOnce(entries[0]).mockResolvedValueOnce(entries[1])
      vi.mocked(endpoints.createMealGroup).mockRejectedValue(new Error('boom'))
      render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} groups={groups} onEntryRepeated={vi.fn()} />
      )

      await user.click(screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' }))

      expect(await screen.findByText('Could not repeat this meal.')).toBeInTheDocument()
    })

    it('disables the button and shows a spinner while the meal repeat is in flight', async () => {
      const user = userEvent.setup()
      let resolveCreate!: (value: FoodEntry) => void
      vi.mocked(endpoints.createEntry).mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = resolve
        })
      )
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g2', name: 'Breakfast', entry_ids: ['1', '2'] })
      render(
        <EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} groups={groups} onEntryRepeated={vi.fn()} />
      )

      await user.click(screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' }))
      const button = screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' })
      expect(button).toBeDisabled()
      expect(button.querySelector('.btn__spinner')).toBeInTheDocument()

      // mockReturnValue hands back the same promise for both calls in Promise.all, so resolving
      // it once resolves the pair.
      resolveCreate(entries[0])
      await waitFor(() => expect(button).toBeEnabled())
    })
  })

  describe('what the tests above leave unpinned', () => {
    it("spells out an entry's time, brand, amount and macros", () => {
      const { container } = render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} />)
      expect(container.querySelector('.entry-row__meta')).toHaveTextContent(/^12:00 · Chiquita · 120g · P1 C27 F0$/)
      expect(screen.getByRole('button', { name: 'Drag to move Banana' })).toBeInTheDocument()
    })

    it('keeps ungrouped entries in place, unboxed, around grouped ones', () => {
      const entries = [
        makeEntry({ id: '1', name: 'Loose A', meal_group_id: null }),
        makeEntry({ id: '2', name: 'Grouped', meal_group_id: 'g1' }),
        makeEntry({ id: '3', name: 'Loose B', meal_group_id: null }),
      ]
      const { container } = render(<EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} />)
      const names = [...container.querySelectorAll('.entry-row__name')].map((name) => name.textContent)
      expect(names).toEqual(['Loose A', 'Grouped', 'Loose B'])
      expect(container.querySelectorAll('.meal-group')).toHaveLength(1)
    })

    it('names each group box after its own group', () => {
      const groups: MealGroup[] = [
        { id: 'g1', name: 'Breakfast', entry_ids: ['1'] },
        { id: 'g2', name: 'Lunch', entry_ids: ['2'] },
      ]
      const entries = [makeEntry({ id: '1', meal_group_id: 'g1' }), makeEntry({ id: '2', meal_group_id: 'g2' })]
      const { container } = render(
        <EntryList {...listHandlers()} entries={entries} groups={groups} onDelete={vi.fn()} />
      )
      const headers = [...container.querySelectorAll('.meal-group__header > span')].map((span) => span.textContent)
      expect(headers).toEqual(['Breakfast', 'Lunch'])
    })

    it('saves a rename trimmed', async () => {
      const user = userEvent.setup()
      const onRenameGroup = vi.fn()
      render(
        <EntryList
          {...listHandlers()}
          entries={[makeEntry({ meal_group_id: 'g1' })]}
          groups={[{ id: 'g1', name: null, entry_ids: ['1'] }]}
          onRenameGroup={onRenameGroup}
          onDelete={vi.fn()}
        />
      )
      await user.click(screen.getByText('Name this meal'))
      await user.type(screen.getByRole('textbox'), '  Lunch  {Enter}')
      expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Lunch')
    })

    it('saves an edited gram amount as grams, whatever the conversion', async () => {
      const user = userEvent.setup()
      const onUpdateEntry = vi.fn()
      render(
        <EntryList
          {...listHandlers()}
          entries={[makeEntry({ input_unit: 'g', unit_to_grams: 50 })]}
          onUpdateEntry={onUpdateEntry}
          onDelete={vi.fn()}
        />
      )
      await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
      const amount = screen.getByLabelText('Amount (grams)')
      await user.clear(amount)
      await user.type(amount, '90')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(onUpdateEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ grams: 90, inputAmount: 90 })
      )
    })

    it('explains a disabled Save, and only when it is disabled', async () => {
      const user = userEvent.setup()
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
      const save = screen.getByRole('button', { name: 'Save' })
      expect(save).not.toHaveAttribute('title')
      await user.clear(screen.getByLabelText('Amount (grams)'))
      expect(save).toHaveAttribute('title', 'Enter an amount greater than 0')
    })

    describe('repeating with changes', () => {
      async function openCustomRepeat(entry = makeEntry()) {
        const user = userEvent.setup()
        render(<EntryList {...listHandlers()} entries={[entry]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />)
        await user.click(screen.getByRole('button', { name: 'Repeat Banana today with a different amount' }))
        return user
      }

      it('explains a disabled Add, and only when it is disabled', async () => {
        const user = await openCustomRepeat()
        const add = screen.getByRole('button', { name: 'Add to today' })
        expect(add).not.toHaveAttribute('title')
        await user.clear(screen.getByLabelText('Amount (grams)'))
        expect(add).toHaveAttribute('title', 'Enter an amount greater than 0')
      })

      it('logs a gram amount as grams, whatever the conversion', async () => {
        vi.mocked(endpoints.createEntry).mockResolvedValue(makeEntry())
        const user = await openCustomRepeat(makeEntry({ input_unit: 'g', unit_to_grams: 50 }))
        const amount = screen.getByLabelText('Amount (grams)')
        await user.clear(amount)
        await user.type(amount, '90')
        await user.click(screen.getByRole('button', { name: 'Add to today' }))
        await waitFor(() =>
          expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 90, input_amount: 90 }))
        )
      })

      it('shows a spinner while it adds, and no stray banner before', async () => {
        let finish!: (entry: FoodEntry) => void
        vi.mocked(endpoints.createEntry).mockReturnValue(new Promise((resolve) => (finish = resolve)))
        const user = await openCustomRepeat()
        expect(document.querySelector('.form__banner')).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Add to today' }))
        expect(screen.getByRole('button', { name: 'Add to today' }).querySelector('.btn__spinner')).toBeInTheDocument()
        await act(async () => finish(makeEntry()))
      })
    })

    it('repeats a meal whose group is missing from the list as an unnamed group', async () => {
      const user = userEvent.setup()
      const entries = [
        makeEntry({ id: '1', meal_group_id: 'gone' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'gone' }),
      ]
      vi.mocked(endpoints.createEntry).mockResolvedValueOnce(entries[0]).mockResolvedValueOnce(entries[1])
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'new', name: null, entry_ids: [] })
      render(
        <EntryList {...listHandlers()} entries={entries} groups={[]} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />
      )
      await user.click(screen.getByRole('button', { name: 'Repeat this meal today' }))
      await waitFor(() => expect(endpoints.createMealGroup).toHaveBeenCalledWith(['1', '2'], null))
    })

    it("repeats a meal under its own group's name, not another group's", async () => {
      const user = userEvent.setup()
      const groups: MealGroup[] = [
        { id: 'other', name: 'Dinner', entry_ids: [] },
        { id: 'g1', name: 'Breakfast', entry_ids: ['1', '2'] },
      ]
      const entries = [
        makeEntry({ id: '1', meal_group_id: 'g1' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g1' }),
      ]
      vi.mocked(endpoints.createEntry).mockResolvedValueOnce(entries[0]).mockResolvedValueOnce(entries[1])
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'new', name: 'Breakfast', entry_ids: [] })
      render(
        <EntryList {...listHandlers()} entries={entries} groups={groups} onDelete={vi.fn()} onEntryRepeated={vi.fn()} />
      )
      await user.click(screen.getByRole('button', { name: 'Repeat this meal today: Breakfast' }))
      await waitFor(() => expect(endpoints.createMealGroup).toHaveBeenCalledWith(['1', '2'], 'Breakfast'))
    })

    it('gives a resting row its row classes and no drag-state ones', () => {
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} />)
      expect(screen.getByText('Banana').closest('li')).toHaveAttribute('class', 'entry-row entry-row--draggable')
    })

    it('says where a removed entry goes', async () => {
      const user = userEvent.setup()
      render(<EntryList {...listHandlers()} entries={[makeEntry()]} onDelete={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
      expect(screen.getByRole('dialog')).toHaveTextContent(
        '"Banana" will be moved to your archive, where you can restore or permanently delete it.'
      )
    })
    // Last in this block: a drag simulation bleeds into whichever test runs next (see below).
    it('moves the entry that was dragged, not whichever is first', () => {
      const onMoveEntry = vi.fn()
      const entries = [
        makeEntry({ id: '1', name: 'Banana', meal_group_id: 'g1' }),
        makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g2' }),
      ]
      render(<EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} onMoveEntry={onMoveEntry} />)
      const banana = screen.getByText('Banana').closest('li')!
      const toast = screen.getByText('Toast').closest('li')!
      stubRects(banana, toast)
      dragEntryOnto(toast, banana)
      expect(onMoveEntry).toHaveBeenCalledWith(entries[1], 'g1')
    })
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
    render(<EntryList {...listHandlers()} entries={entries} onDelete={vi.fn()} onMoveEntry={onMoveEntry} />)

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

describe('applyDrop', () => {
  const banana = makeEntry({ id: '1', meal_group_id: 'g1' })
  const toast = makeEntry({ id: '2', name: 'Toast', meal_group_id: 'g2' })

  it('moves the dragged entry into the group it was dropped on', () => {
    const onMoveEntry = vi.fn()
    applyDrop([banana, toast], { id: '2' }, { id: 'g1' }, onMoveEntry)
    expect(onMoveEntry).toHaveBeenCalledWith(toast, 'g1')
  })

  it('does nothing for a drop outside every row, or back onto its own group', () => {
    const onMoveEntry = vi.fn()
    applyDrop([banana, toast], { id: '1' }, null, onMoveEntry)
    applyDrop([banana, toast], { id: '1' }, { id: 'g1' }, onMoveEntry)
    expect(onMoveEntry).not.toHaveBeenCalled()
  })
})
