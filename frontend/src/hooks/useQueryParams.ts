import { useCallback } from 'react'

import { useSearchParams } from 'react-router'

export type QueryParamUpdates = Record<string, string | null>

// Page state that should survive a refresh and be linkable lives in the query string. Every change
// goes through one setSearchParams call (null removes a key), since separate calls in the same tick
// each start from the same stale params and the last one wins. Changes replace the history entry
// rather than pushing one, so stepping through days or typing a search doesn't bury the page
// under dozens of back-button stops.
export function useQueryParams(): [URLSearchParams, (updates: QueryParamUpdates) => void] {
  const [params, setParams] = useSearchParams()
  const update = useCallback(
    (updates: QueryParamUpdates) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(updates)) {
            if (value === null) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )
  return [params, update]
}
