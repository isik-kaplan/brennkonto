import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { FoodSearchResult } from '../../src/api/types'
import { useFoodSearch } from '../../src/hooks/useFoodSearch'
import { triggerIntersection } from '../testUtils/intersectionObserver'

vi.mock('../../src/api/endpoints')

// Matches the backend's _PAGE_SIZE (backend/app/controllers/foods.py) - a page this long is what
// tells the hook there may be a next one.
const PAGE_SIZE = 25

function fakeResult(id: number): FoodSearchResult {
  return {
    barcode: String(id),
    name: `Product ${id}`,
    brand: 'Brand',
    calories_per_100g: 100,
    protein_per_100g: 1,
    carbs_per_100g: 2,
    fat_per_100g: 3,
    suggested_unit: 'g',
    unit_to_grams: 1,
  }
}

function fullPage(offset = 0): FoodSearchResult[] {
  return Array.from({ length: PAGE_SIZE }, (_, i) => fakeResult(offset + i))
}

// Attaches a real (detached) DOM node as the sentinel up front, the way a component always has
// one mounted in the results list before there's ever a reason to observe it - so the hook's own
// effect can find it via the ref the moment `hasMore` flips true.
function renderWithSentinel() {
  const rendered = renderHook(() => useFoodSearch())
  act(() => {
    rendered.result.current.sentinelRef(document.createElement('div'))
  })
  return rendered
}

beforeEach(() => {
  vi.mocked(endpoints.searchFoods).mockReset()
})

describe('useFoodSearch', () => {
  it('does not search below the minimum query length', async () => {
    const { result } = renderWithSentinel()
    act(() => result.current.setQuery('a'))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(endpoints.searchFoods).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('debounces before fetching page 1', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValue([fakeResult(1)])
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    expect(result.current.isSearching).toBe(true)
    expect(endpoints.searchFoods).not.toHaveBeenCalled()

    await waitFor(() => expect(endpoints.searchFoods).toHaveBeenCalledWith('product', 1))
    await waitFor(() => expect(result.current.isSearching).toBe(false))
    expect(result.current.results).toEqual([fakeResult(1)])
  })

  it('reports a search error from an ApiError', async () => {
    vi.mocked(endpoints.searchFoods).mockRejectedValue(new ApiError('Search unavailable.', 503))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.searchError).toBe('Search unavailable.'))
  })

  it('falls back to a generic message for a non-ApiError search failure', async () => {
    vi.mocked(endpoints.searchFoods).mockRejectedValue(new Error('boom'))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.searchError).toBe('Search failed.'))
  })

  it('clears results and resets to page 1 when the query drops below the minimum length', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValue([fakeResult(1)])
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toEqual([fakeResult(1)]))

    act(() => result.current.setQuery('p'))
    expect(result.current.results).toEqual([])
  })

  it('treats a full page as "there may be more" and loads the next page on scroll', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPage(0))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE))

    let resolveSecondPage: (value: FoodSearchResult[]) => void = () => {}
    vi.mocked(endpoints.searchFoods).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondPage = resolve
      })
    )

    act(() => triggerIntersection())
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true))
    expect(endpoints.searchFoods).toHaveBeenCalledWith('product', 2)

    act(() => resolveSecondPage(fullPage(PAGE_SIZE)))
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    expect(result.current.results).toHaveLength(PAGE_SIZE * 2)
  })

  it('treats a short page as the last one and never observes further scroll', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce([fakeResult(1)])
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(1))

    expect(() => triggerIntersection()).toThrow('No IntersectionObserver has been constructed yet.')
    expect(endpoints.searchFoods).toHaveBeenCalledTimes(1)
  })

  it('does not load more when the sentinel reports leaving (not entering) view', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPage(0))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE))

    act(() => triggerIntersection(false))
    expect(endpoints.searchFoods).toHaveBeenCalledTimes(1)
  })

  it('drops any next-page item whose barcode already appeared on an earlier page', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPage(0))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE))

    // The backend's own candidate pool can grow enough between pages that something already
    // shown resurfaces "found" on a later page - simulated here by echoing item 0 back.
    const overlappingPage = [fakeResult(0), ...fullPage(PAGE_SIZE).slice(1)]
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(overlappingPage)

    act(() => triggerIntersection())
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    const barcodes = result.current.results.map((r) => r.barcode)
    expect(barcodes.filter((b) => b === '0')).toHaveLength(1)
    expect(result.current.results).toHaveLength(PAGE_SIZE * 2 - 1)
  })

  it('reports a load-more error from an ApiError', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPage(0))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE))

    vi.mocked(endpoints.searchFoods).mockRejectedValueOnce(new ApiError('Search unavailable.', 503))
    act(() => triggerIntersection())
    await waitFor(() => expect(result.current.searchError).toBe('Search unavailable.'))
    expect(result.current.isLoadingMore).toBe(false)
  })

  it('falls back to a generic message for a non-ApiError load-more failure', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPage(0))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE))

    vi.mocked(endpoints.searchFoods).mockRejectedValueOnce(new Error('boom'))
    act(() => triggerIntersection())
    await waitFor(() => expect(result.current.searchError).toBe('Search failed.'))
  })

  it('ignores a scroll trigger that fires while a page is still loading', async () => {
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPage(0))
    const { result } = renderWithSentinel()

    act(() => result.current.setQuery('product'))
    await waitFor(() => expect(result.current.results).toHaveLength(PAGE_SIZE))

    let resolveSecondPage: (value: FoodSearchResult[]) => void = () => {}
    vi.mocked(endpoints.searchFoods).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecondPage = resolve
      })
    )
    act(() => triggerIntersection())
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true))

    // While page 2 is still in flight, the observer has been torn down (see the hook's effect
    // guard) - nothing is listening, so there's no observer left to re-trigger.
    expect(() => triggerIntersection()).toThrow('No IntersectionObserver has been constructed yet.')

    act(() => resolveSecondPage(fullPage(PAGE_SIZE)))
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    expect(endpoints.searchFoods).toHaveBeenCalledTimes(2)
  })
})
