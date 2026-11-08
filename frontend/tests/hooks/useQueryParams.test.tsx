import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'

import { useQueryParams } from '../../src/hooks/useQueryParams'

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/before', '/page?keep=1&drop=x']}>{children}</MemoryRouter>
}

function useHarness() {
  const [params, update] = useQueryParams()
  return { params, update, location: useLocation(), navigate: useNavigate() }
}

describe('useQueryParams', () => {
  it('sets and removes several params in one update, leaving the rest alone', () => {
    const { result } = renderHook(useHarness, { wrapper })
    act(() => result.current.update({ added: 'y', drop: null }))
    expect(result.current.location.search).toBe('?keep=1&added=y')
    expect(result.current.params.get('added')).toBe('y')
  })

  it('replaces the history entry instead of pushing one', () => {
    const { result } = renderHook(useHarness, { wrapper })
    act(() => result.current.update({ a: '1' }))
    act(() => result.current.update({ a: '2' }))
    act(() => result.current.navigate(-1))
    expect(result.current.location.pathname).toBe('/before')
  })
})
