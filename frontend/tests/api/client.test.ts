import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, NetworkError, api } from '../../src/api/client'

function mockFetchOnce(response: Partial<Response> & { jsonBody?: unknown }) {
  const { jsonBody, ...rest } = response
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(jsonBody),
    ...rest,
  } as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api.get', () => {
  it('returns the parsed JSON body on success', async () => {
    mockFetchOnce({ ok: true, status: 200, jsonBody: { hello: 'world' } })
    await expect(api.get('/ping')).resolves.toEqual({ hello: 'world' })
  })

  it('calls fetch with the /api prefix and credentials included', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, jsonBody: {} })
    await api.get('/ping')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ping',
      expect.objectContaining({ credentials: 'include', headers: undefined })
    )
  })

  it('returns undefined for a 204 without reading the body', async () => {
    const jsonSpy = vi.fn()
    mockFetchOnce({ ok: true, status: 204, json: jsonSpy })
    await expect(api.get('/ping')).resolves.toBeUndefined()
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('throws ApiError with the server-provided detail on failure', async () => {
    mockFetchOnce({ ok: false, status: 404, jsonBody: { detail: 'Not found.' } })
    const error = (await api.get('/missing').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('Not found.')
    expect(error.status).toBe(404)
  })

  it('falls back to a generic message when the body has no detail string', async () => {
    mockFetchOnce({ ok: false, status: 500, jsonBody: { oops: true } })
    const error = (await api.get('/broken').catch((e: unknown) => e)) as ApiError
    expect(error.message).toBe('Request failed (500).')
  })

  it('falls back to a generic message when the body is not valid JSON', async () => {
    mockFetchOnce({ ok: false, status: 502, json: vi.fn().mockRejectedValue(new Error('bad json')) })
    const error = (await api.get('/broken').catch((e: unknown) => e)) as ApiError
    expect(error.message).toBe('Request failed (502).')
  })

  it('throws NetworkError, not ApiError, when fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = (await api.get('/ping').catch((e: unknown) => e)) as NetworkError
    expect(error).toBeInstanceOf(NetworkError)
    expect(error).not.toBeInstanceOf(ApiError)
    expect(error.message).toBe("Can't connect. Check your connection and try again.")
  })
})

describe('api.post / api.patch / api.delete', () => {
  it('sends a JSON body and Content-Type header when a body is given', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, jsonBody: {} })
    await api.post('/things', { name: 'apple' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/things',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'apple' }),
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  it('sends no body and no Content-Type when called without one', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })
    await api.post('/auth/logout')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', body: undefined, headers: undefined })
    )
  })

  it('patch sends the PATCH method with a body', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, jsonBody: {} })
    await api.patch('/things/1', { name: 'pear' })
    expect(fetchMock).toHaveBeenCalledWith('/api/things/1', expect.objectContaining({ method: 'PATCH' }))
  })

  it('delete sends the DELETE method with no body', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })
    await api.delete('/things/1')
    expect(fetchMock).toHaveBeenCalledWith('/api/things/1', expect.objectContaining({ method: 'DELETE' }))
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body')
  })
})
