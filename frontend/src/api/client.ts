export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  body?: unknown
  signal?: AbortSignal
}

const SAFE_METHODS: ReadonlySet<Method> = new Set(['GET'])
const CSRF_COOKIE = 'csrftoken'

let unauthorizedHandler: (() => void) | null = null

/** Called whenever the API answers 401 (session missing or expired). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

export function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function hasCsrfToken(): boolean {
  return getCookie(CSRF_COOKIE) !== null
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`
  let fieldErrors: Record<string, string[]> = {}
  try {
    const data: unknown = await res.json()
    if (data && typeof data === 'object') {
      const { detail, ...rest } = data as Record<string, unknown>
      if (typeof detail === 'string') {
        message = detail
      }
      fieldErrors = Object.fromEntries(
        Object.entries(rest).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])),
      )
      const firstFieldError = Object.values(fieldErrors)[0]?.[0]
      if (typeof detail !== 'string' && firstFieldError) {
        message = firstFieldError
      }
    }
  } catch {
    // Non-JSON error body (e.g. proxy error page); keep the generic message.
  }
  return new ApiError(res.status, message, fieldErrors)
}

export async function apiRequest<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (!SAFE_METHODS.has(method)) {
    const token = getCookie(CSRF_COOKIE)
    if (token) headers['X-CSRFToken'] = token
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    signal: options.signal,
  })

  if (!res.ok) {
    if (res.status === 401) unauthorizedHandler?.()
    throw await parseError(res)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => apiRequest<T>('GET', path, { signal })
export const apiPost = <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, { body })

