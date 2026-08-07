const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
const sessionStorageKey = 'campusone.session'

/**
 * Dispatched on window after an admin request cannot refresh the persisted session.
 * App-level authentication can listen for this event and return the user to sign-in.
 */
export const ADMIN_SESSION_EXPIRED_EVENT = 'campusone:session-expired'

interface StoredSession {
  accessToken: string
  refreshToken: string
  [key: string]: unknown
}

interface ApiPayload<T> {
  success: boolean
  data?: T
  error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]>; traceId?: string }
}

let refreshPromise: Promise<string> | null = null

export interface PageData<T> {
  count: number
  page: number
  pageSize: number
  totalPages: number
  next: string | null
  previous: string | null
  items: T[]
}

export class AdminApiError extends Error {
  code: string
  fieldErrors: Record<string, string[]>
  status: number
  traceId?: string

  constructor(message: string, options: { code?: string; fieldErrors?: Record<string, string[]>; status?: number; traceId?: string } = {}) {
    super(message)
    this.name = 'AdminApiError'
    this.code = options.code ?? 'REQUEST_FAILED'
    this.fieldErrors = options.fieldErrors ?? {}
    this.status = options.status ?? 0
    this.traceId = options.traceId
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const stored = localStorage.getItem(sessionStorageKey)
    if (!stored) return null
    const session: unknown = JSON.parse(stored)
    if (
      typeof session !== 'object'
      || session === null
      || typeof (session as StoredSession).accessToken !== 'string'
      || !(session as StoredSession).accessToken
      || typeof (session as StoredSession).refreshToken !== 'string'
      || !(session as StoredSession).refreshToken
    ) return null
    return session as StoredSession
  } catch {
    return null
  }
}

function expireStoredSession(): void {
  try {
    localStorage.removeItem(sessionStorageKey)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  try {
    window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT))
  } catch {
    // Request failure must still propagate when no browser event target is available.
  }
}

async function readPayload<T>(response: Response): Promise<ApiPayload<T> | null> {
  try {
    return await response.json() as ApiPayload<T>
  } catch {
    return null
  }
}

async function responseData<T>(response: Response): Promise<T> {
  if (response.status === 204 && response.ok) return undefined as T
  const payload = await readPayload<T>(response)
  if (!response.ok || !payload?.success || payload.data === undefined) {
    const traceId = payload?.error?.traceId ?? response.headers.get('X-Trace-Id') ?? undefined
    throw new AdminApiError(payload?.error?.message ?? 'The request could not be completed.', {
      code: payload?.error?.code,
      fieldErrors: payload?.error?.fieldErrors,
      status: response.status,
      traceId,
    })
  }
  return payload.data
}

function requestHeaders(accessToken: string, options: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
  }
  new Headers(options.headers).forEach((value, key) => {
    const existingKey = Object.keys(headers).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
    if (existingKey) delete headers[existingKey]
    headers[key] = value
  })
  return headers
}

/** Uploads are sent as multipart without setting Content-Type manually (the browser adds the boundary). */
export function adminUpload<T>(accessToken: string, path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const body = new FormData()
  body.append('file', file, file.name)
  Object.entries(fields).forEach(([key, value]) => body.append(key, value))
  return adminRequest<T>(accessToken, path, { method: 'POST', body })
}

function fetchAdmin(accessToken: string, path: string, options: RequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl}/api/v1/admin/${path}`, {
    ...options,
    headers: requestHeaders(accessToken, options),
  })
}

async function refreshStoredSession(): Promise<string> {
  try {
    const session = readStoredSession()
    if (!session) throw new Error('No refreshable session is available.')

    const response = await fetch(`${apiBaseUrl}/api/v1/identity/sessions/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
    const refreshed = await responseData<{ accessToken: string; refreshToken: string }>(response)
    if (!refreshed.accessToken || !refreshed.refreshToken) {
      throw new Error('The refresh response did not contain valid tokens.')
    }

    const currentSession = readStoredSession()
    if (!currentSession || currentSession.refreshToken !== session.refreshToken) {
      throw new Error('The persisted session changed while it was being refreshed.')
    }
    localStorage.setItem(sessionStorageKey, JSON.stringify({
      ...currentSession,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    }))
    return refreshed.accessToken
  } catch (error) {
    expireStoredSession()
    throw error
  }
}

function refreshOnce(): Promise<string> {
  if (refreshPromise) return refreshPromise
  const pending = refreshStoredSession()
  refreshPromise = pending
  void pending.then(
    () => { if (refreshPromise === pending) refreshPromise = null },
    () => { if (refreshPromise === pending) refreshPromise = null },
  )
  return pending
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function waitForRefresh(pending: Promise<string>, signal?: AbortSignal | null): Promise<string> {
  if (!signal) return pending
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void pending.then(
      (token) => {
        signal.removeEventListener('abort', onAbort)
        resolve(token)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof payload.exp !== 'number') return false
    // Proactively refresh if the token expires in less than 10 seconds
    return payload.exp * 1000 < Date.now() + 10000
  } catch {
    return false
  }
}

export async function adminRequest<T>(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let token = readStoredSession()?.accessToken ?? accessToken
  if (token && isTokenExpired(token)) {
    try {
      token = await waitForRefresh(refreshOnce(), options.signal)
    } catch {
      if (options.signal?.aborted) throw abortReason(options.signal)
    }
  }

  const response = await fetchAdmin(token, path, options)
  if (response.status !== 401) return responseData<T>(response)

  // Decode before refreshing so a failed refresh preserves the original API error and trace ID.
  let unauthorizedError: AdminApiError
  try {
    await responseData<T>(response)
    unauthorizedError = new AdminApiError('The request could not be completed.', { status: 401 })
  } catch (error) {
    unauthorizedError = error instanceof AdminApiError
      ? error
      : new AdminApiError('The request could not be completed.', { status: 401 })
  }

  let refreshedAccessToken: string
  try {
    refreshedAccessToken = await waitForRefresh(refreshOnce(), options.signal)
  } catch {
    if (options.signal?.aborted) throw abortReason(options.signal)
    throw unauthorizedError
  }

  // This is the sole retry path. A second 401 means the replacement credentials
  // cannot authenticate this session, so expire it instead of leaking an API error.
  const retriedResponse = await fetchAdmin(refreshedAccessToken, path, options)
  if (retriedResponse.status === 401) expireStoredSession()
  return responseData<T>(retriedResponse)
}
