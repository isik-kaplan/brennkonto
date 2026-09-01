import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '../api/client'
import { searchFoods } from '../api/endpoints'
import type { FoodSearchResult } from '../api/types'

// Mirrors the backend's _PAGE_SIZE (backend/app/controllers/foods.py) - used only to tell whether
// a page came back full (there may be more) or short (it was the last one).
const PAGE_SIZE = 25
const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 350

export interface FoodSearchState {
  query: string
  setQuery: (query: string) => void
  results: FoodSearchResult[]
  isSearching: boolean
  isLoadingMore: boolean
  searchError: string | null
  setSearchError: (error: string | null) => void
  // Attach to a element rendered right after the last result (inside the same scrollable
  // container) - scrolling it into view loads the next page.
  sentinelRef: (node: HTMLDivElement | null) => void
}

// Shared by LogFood and AddEntryPanel's product search: debounces typing, fetches the first page,
// then infinite-scrolls further pages in as the sentinel element comes into view, rather than a
// numbered pager or a "load more" button.
export function useFoodSearch(): FoodSearchState {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setHasMore(false)
      setPage(1)
      return
    }
    setIsSearching(true)
    setSearchError(null)
    const timeout = setTimeout(() => {
      searchFoods(trimmed, 1)
        .then((firstPage) => {
          setResults(firstPage)
          setPage(1)
          setHasMore(firstPage.length === PAGE_SIZE)
        })
        .catch((error) => setSearchError(error instanceof ApiError ? error.message : 'Search failed.'))
        .finally(() => setIsSearching(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmed])

  const loadMore = useCallback(() => {
    const nextPage = page + 1
    setIsLoadingMore(true)
    searchFoods(trimmed, nextPage)
      .then((nextResults) => {
        setResults((prev) => {
          // Belt-and-suspenders against a result resurfacing on a later page - the backend's own
          // candidate pool grows with `page`, so something it had to synthesize from history on
          // an early page can occasionally turn up "found" (in its natural, later position) once
          // the pool is big enough. See the pool-sizing comment in
          // backend/app/controllers/foods.py.
          const seen = new Set(prev.map((result) => result.barcode))
          return [...prev, ...nextResults.filter((result) => !seen.has(result.barcode))]
        })
        setPage(nextPage)
        setHasMore(nextResults.length === PAGE_SIZE)
      })
      .catch((error) => setSearchError(error instanceof ApiError ? error.message : 'Search failed.'))
      .finally(() => setIsLoadingMore(false))
  }, [page, trimmed])

  const sentinelNode = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    sentinelNode.current = node
  }, [])

  useEffect(() => {
    const node = sentinelNode.current
    if (!node || !hasMore || isLoadingMore || isSearching) return
    // The results list is its own scroll container (max-height + overflow-y: auto), not the
    // page/viewport, so the observer's root has to be that container - its immediate parent,
    // since the sentinel renders as the list's last child - rather than the default (viewport).
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { root: node.parentElement }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, isSearching, loadMore])

  return {
    query,
    setQuery,
    results,
    isSearching,
    isLoadingMore,
    searchError,
    setSearchError,
    sentinelRef,
  }
}
