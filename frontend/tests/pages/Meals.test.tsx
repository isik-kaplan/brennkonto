import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { FoodSearchResult, HistoryGroupItem, MealName } from '../../src/api/types'
import Meals from '../../src/pages/Meals'

vi.mock('../../src/api/endpoints')

const oats: HistoryGroupItem = {
  name: 'Oats',
  brand: 'Kölln',
  barcode: '5000',
  grams: 60,
  input_unit: 'g',
  input_amount: 60,
  unit_to_grams: 1,
  calories_per_100g: 380,
  protein_per_100g: 13,
  carbs_per_100g: 60,
  fat_per_100g: 7,
}

const eggs: HistoryGroupItem = {
  name: 'Egg',
  brand: null,
  barcode: '6000',
  grams: 100,
  input_unit: 'count',
  input_amount: 2,
  unit_to_grams: 50,
  calories_per_100g: 155,
  protein_per_100g: 13,
  carbs_per_100g: 1,
  fat_per_100g: 11,
}

const porridge: MealName = {
  name: 'Porridge',
  items: [oats, eggs],
  calories: 383,
  protein_g: 20.8,
  carbs_g: 37,
  fat_g: 15.2,
  times_logged: 0,
  last_logged_at: null,
  saved_meal_id: 'meal-1',
}

const breakfast: MealName = {
  name: 'Breakfast',
  items: [oats],
  calories: 228,
  protein_g: 7.8,
  carbs_g: 36,
  fat_g: 4.2,
  times_logged: 3,
  last_logged_at: '2026-08-20T08:00:00Z',
  saved_meal_id: null,
}

const eggResult: FoodSearchResult = {
  barcode: '6000',
  name: 'Egg',
  brand: 'Farm',
  calories_per_100g: 155,
  protein_per_100g: 13,
  carbs_per_100g: 1,
  fat_per_100g: 11,
  suggested_unit: 'count',
  unit_to_grams: 50,
}

function renderMeals() {
  return render(
    <MemoryRouter>
      <Meals />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.mocked(endpoints.fetchMealNames).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.removeMealName).mockReset()
  vi.mocked(endpoints.renameMealName).mockReset()
  vi.mocked(endpoints.searchFoods).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.lookupBarcode).mockReset()
  vi.mocked(endpoints.createSavedMeal).mockReset()
  vi.mocked(endpoints.updateSavedMeal).mockReset()
})

describe('Meals', () => {
  it('shows an empty state when there are no meals yet', async () => {
    renderMeals()
    expect(await screen.findByText(/No meals yet/)).toBeInTheDocument()
  })

  it('shows saved and logged meals the same way, each as a card of its foods', async () => {
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([breakfast, porridge])
    renderMeals()

    const card = (await screen.findByText('Porridge')).closest('.meal-group')!
    expect(card).toHaveTextContent('383 kcal · P21 C37 F15 · not logged yet')
    expect(card).toHaveTextContent('Kölln · 60g · P8 C36 F4')
    expect(card).toHaveTextContent('2 count (≈100g)')
    expect(card).toHaveTextContent('155 kcal')

    expect(screen.getByText('Breakfast').closest('.meal-group')).toHaveTextContent(/logged 3×, last/)
  })

  it('shows a food without a barcode', async () => {
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([
      { ...breakfast, items: [{ ...oats, barcode: null, name: 'Homemade bread' }] },
    ])
    renderMeals()
    expect(await screen.findByText('Homemade bread')).toBeInTheDocument()
  })

  it('shows a load error', async () => {
    vi.mocked(endpoints.fetchMealNames).mockRejectedValue(new ApiError('Server down', 500))
    renderMeals()
    expect(await screen.findByText('Server down')).toBeInTheDocument()
  })

  it('builds and saves a new meal from searched foods', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([eggResult])
    vi.mocked(endpoints.fetchMealNames).mockResolvedValueOnce([]).mockResolvedValueOnce([porridge])
    renderMeals()

    await user.click(await screen.findByRole('button', { name: '+ Add meal' }))
    const save = screen.getByRole('button', { name: 'Save meal' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Meal name'), 'Eggs')
    await user.type(screen.getByLabelText('Add a food'), 'egg')
    await user.click(await screen.findByRole('button', { name: /Egg/ }))

    const amount = screen.getByLabelText('How many?')
    await user.clear(amount)
    await user.type(amount, '3')
    // Both the item's own calories and the meal total - it's the only item.
    expect(screen.getAllByText('233')).toHaveLength(2)

    await user.click(save)
    expect(endpoints.createSavedMeal).toHaveBeenCalledWith('Eggs', [
      expect.objectContaining({ name: 'Egg', input_unit: 'count', input_amount: 3, unit_to_grams: 50 }),
    ])
    expect(await screen.findByText('Porridge')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save meal' })).not.toBeInTheDocument()
  })

  it('adds a food by barcode, with Enter looking it up rather than saving the meal', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(eggResult)
    renderMeals()

    await user.click(await screen.findByRole('button', { name: '+ Add meal' }))
    await user.type(screen.getByLabelText('Meal name'), 'Eggs')
    await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')

    expect(endpoints.lookupBarcode).toHaveBeenCalledWith('6000')
    expect(await screen.findByLabelText('How many?')).toHaveValue(1)
    expect(screen.getByLabelText('Or add by barcode')).toHaveValue('')
    expect(endpoints.createSavedMeal).not.toHaveBeenCalled()
  })

  it('shows a barcode lookup error', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new ApiError('Product not found', 404))
    renderMeals()

    await user.click(await screen.findByRole('button', { name: '+ Add meal' }))
    await user.type(screen.getByLabelText('Or add by barcode'), '123')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(await screen.findByText('Product not found')).toBeInTheDocument()
  })

  it('offers scanning with the camera', async () => {
    const user = userEvent.setup()
    renderMeals()
    await user.click(await screen.findByRole('button', { name: '+ Add meal' }))
    expect(screen.getByRole('button', { name: 'Scan with camera' })).toBeInTheDocument()
  })

  it('edits a saved meal in place', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Edit Porridge' }))
    const amount = screen.getByLabelText('Amount (grams)')
    expect(amount).toHaveValue(60)
    await user.clear(amount)
    await user.type(amount, '80')
    await user.click(screen.getByRole('button', { name: 'Remove Egg from this meal' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(endpoints.updateSavedMeal).toHaveBeenCalledWith('meal-1', 'Porridge', [
      expect.objectContaining({ name: 'Oats', input_unit: 'g', input_amount: 80 }),
    ])
    expect(endpoints.createSavedMeal).not.toHaveBeenCalled()
  })

  it('saves a logged-only meal when edited, bringing its logged occurrences along on a rename', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([breakfast])
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Edit Breakfast' }))
    const name = screen.getByLabelText('Meal name')
    await user.clear(name)
    await user.type(name, 'Brekkie')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(endpoints.createSavedMeal).toHaveBeenCalledWith('Brekkie', [expect.objectContaining({ name: 'Oats' })])
    expect(endpoints.renameMealName).toHaveBeenCalledWith('Breakfast', 'Brekkie')
  })

  it('does not rename when a logged-only meal keeps its name', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([breakfast])
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Edit Breakfast' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(endpoints.createSavedMeal).toHaveBeenCalled()
    expect(endpoints.renameMealName).not.toHaveBeenCalled()
  })

  it('shows the error when saving fails and keeps the editor open', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
    vi.mocked(endpoints.updateSavedMeal).mockRejectedValue(new ApiError('Name taken', 400))
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Edit Porridge' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Name taken')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('cancels editing', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Edit Porridge' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Edit Porridge' })).toBeInTheDocument()
  })

  it('deletes a meal after confirming', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValueOnce([porridge]).mockResolvedValueOnce([])
    vi.mocked(endpoints.removeMealName).mockResolvedValue(undefined)
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Delete Porridge' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(endpoints.removeMealName).toHaveBeenCalledWith('Porridge')
    await waitFor(() => expect(screen.queryByText('Porridge')).not.toBeInTheDocument())
  })

  it('closes the new-meal form on cancel', async () => {
    const user = userEvent.setup()
    renderMeals()
    await user.click(await screen.findByRole('button', { name: '+ Add meal' }))
    expect(screen.getByRole('button', { name: '+ Add meal' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('New meal')).not.toBeInTheDocument()
  })

  it('keeps a meal when deleting is cancelled', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
    renderMeals()
    await user.click(await screen.findByRole('button', { name: 'Delete Porridge' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      `"Porridge" will no longer be offered when you log food. Nothing you've logged is deleted - any time you've had it stays in your history, just as individual foods.`
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(endpoints.removeMealName).not.toHaveBeenCalled()
    expect(screen.getByText('Porridge')).toBeInTheDocument()
  })

  it('falls back to a generic message when loading fails unexpectedly', async () => {
    vi.mocked(endpoints.fetchMealNames).mockRejectedValue(new Error('network'))
    renderMeals()
    expect(await screen.findByText('Could not load your meals.')).toBeInTheDocument()
  })

  it('shows an API error from deleting', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
    vi.mocked(endpoints.removeMealName).mockRejectedValue(new ApiError('Gone', 404))
    renderMeals()
    await user.click(await screen.findByRole('button', { name: 'Delete Porridge' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Gone')).toBeInTheDocument()
  })

  it('shows the error when deleting fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
    vi.mocked(endpoints.removeMealName).mockRejectedValue(new Error('boom'))
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Delete Porridge' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Could not delete "Porridge".')).toBeInTheDocument()
  })

  describe('loading and empty states', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((res) => (resolve = res))
      return { promise, resolve }
    }

    it('shows only a loader until the meals arrive', async () => {
      const load = deferred<MealName[]>()
      vi.mocked(endpoints.fetchMealNames).mockReturnValue(load.promise)
      const { container } = renderMeals()

      expect(screen.getByText('Loading…')).toBeInTheDocument()
      expect(screen.queryByText(/No meals yet/)).not.toBeInTheDocument()
      expect(container.querySelector('.entry-list')).not.toBeInTheDocument()

      await act(async () => load.resolve([porridge]))
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
      expect(screen.getByText('Porridge')).toBeInTheDocument()
    })

    it('swaps the list for the loader while reloading', async () => {
      const user = userEvent.setup()
      const reload = deferred<MealName[]>()
      vi.mocked(endpoints.fetchMealNames)
        .mockResolvedValueOnce([porridge, breakfast])
        .mockReturnValueOnce(reload.promise)
      vi.mocked(endpoints.removeMealName).mockResolvedValue(undefined)
      renderMeals()

      await user.click(await screen.findByRole('button', { name: 'Delete Porridge' }))
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      expect(await screen.findByText('Loading…')).toBeInTheDocument()
      expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()

      await act(async () => reload.resolve([breakfast]))
      expect(screen.getByText('Breakfast')).toBeInTheDocument()
    })

    it('shows no list and no banners when there are no meals', async () => {
      const { container } = renderMeals()
      await screen.findByText(/No meals yet/)
      expect(container.querySelector('.entry-list')).not.toBeInTheDocument()
      expect(container.querySelector('.form__banner')).not.toBeInTheDocument()
    })

    it('shows neither banners nor the empty state alongside a normal list', async () => {
      vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
      const { container } = renderMeals()
      await screen.findByText('Porridge')
      expect(container.querySelector('.form__banner')).not.toBeInTheDocument()
      expect(screen.queryByText(/No meals yet/)).not.toBeInTheDocument()
    })

    it('paints the loader, not the empty state, before the first load has even started', () => {
      // A server render runs no effects - it's the first frame, before load() kicks off.
      const html = renderToString(
        <MemoryRouter>
          <Meals />
        </MemoryRouter>
      )
      expect(html).toContain('Loading…')
      expect(html).not.toContain('No meals yet')
    })

    it('titles each card with the name and a summary', async () => {
      vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
      const { container } = renderMeals()
      await screen.findByText('Porridge')
      expect(container.querySelector('.meal-group__header > span')).toHaveTextContent(
        /^Porridge · 383 kcal · P21 C37 F15 · not logged yet$/
      )
    })

    it('shows the load error instead of the empty state', async () => {
      vi.mocked(endpoints.fetchMealNames).mockRejectedValue(new ApiError('Server down', 500))
      renderMeals()
      await screen.findByText('Server down')
      expect(screen.queryByText(/No meals yet/)).not.toBeInTheDocument()
    })

    it("spells out each food's amount and macros, with no brand prefix when there's none", async () => {
      vi.mocked(endpoints.fetchMealNames).mockResolvedValue([porridge])
      const { container } = renderMeals()
      await screen.findByText('Porridge')
      const metas = [...container.querySelectorAll('.entry-row__meta')].map((meta) => meta.textContent)
      expect(metas).toContain('Kölln · 60g · P8 C36 F4')
      expect(metas).toContain('2 count (≈100g) · P13 C1 F11')
    })
  })
})
