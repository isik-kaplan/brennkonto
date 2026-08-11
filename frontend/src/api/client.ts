export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Thrown when `fetch` itself fails to reach the server - no connection, DNS failure, the request
// never got a response - as opposed to ApiError, which means a response *did* come back, just
// with a non-2xx status. Callers use this to show "can't connect" instead of, say, treating it
// like an auth failure.
export class NetworkError extends Error {
  constructor() {
    super("Can't connect. Check your connection and try again.")
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    })
  } catch {
    throw new NetworkError()
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      (payload && typeof payload.detail === 'string' && payload.detail) || `Request failed (${response.status}).`
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
