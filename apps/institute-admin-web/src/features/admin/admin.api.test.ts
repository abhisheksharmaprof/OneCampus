import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  AdminApiError,
  adminRequest,
  type PageData,
} from './admin.api'

const session = {
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  user: { id: 'user-1', displayName: 'Admin' },
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  })
}

function success<T>(data: T, status = 200): Response {
  return jsonResponse({ success: true, data }, status)
}

function failure(
  status: number,
  error: { code?: string; message?: string; fieldErrors?: Record<string, string[]>; traceId?: string } = {},
  headers?: HeadersInit,
): Response {
  return jsonResponse({ success: false, error }, status, headers)
}

function authorization(init?: RequestInit): string | null {
  return new Headers(init?.headers).get('Authorization')
}

beforeEach(() => {
  localStorage.setItem('campusone.session', JSON.stringify(session))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('adminRequest', () => {
  it('returns page data and sends the bearer token without refreshing', async () => {
    const page: PageData<{ id: string }> = {
      count: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      next: null,
      previous: null,
      items: [{ id: 'record-1' }],
    }
    const fetchMock = vi.fn().mockResolvedValue(success(page))
    vi.stubGlobal('fetch', fetchMock)

    await expect(adminRequest('old-access', 'roles')).resolves.toEqual(page)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(authorization(fetchMock.mock.calls[0][1])).toBe('Bearer old-access')
  })

  it('preserves 204 handling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(adminRequest<void>('old-access', 'roles/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('preserves AdminApiError details and trace IDs from payloads and headers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(422, {
        code: 'INVALID_ROLE',
        message: 'Role is invalid.',
        fieldErrors: { name: ['Already used.'] },
        traceId: 'payload-trace',
      }))
      .mockResolvedValueOnce(failure(500, {}, { 'X-Trace-Id': 'header-trace' }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await adminRequest('old-access', 'roles').catch((error: unknown) => error)
    expect(first).toBeInstanceOf(AdminApiError)
    expect(first).toMatchObject({
      code: 'INVALID_ROLE',
      message: 'Role is invalid.',
      fieldErrors: { name: ['Already used.'] },
      status: 422,
      traceId: 'payload-trace',
    })

    const second = await adminRequest('old-access', 'roles').catch((error: unknown) => error)
    expect(second).toMatchObject({ status: 500, traceId: 'header-trace' })
  })

  it('refreshes on 401, rotates stored tokens, and retries a POST exactly once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(401, { code: 'TOKEN_EXPIRED', traceId: 'original-trace' }))
      .mockResolvedValueOnce(success({ accessToken: 'new-access', refreshToken: 'new-refresh', user: session.user }))
      .mockResolvedValueOnce(success({ id: 'role-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const body = JSON.stringify({ name: 'Principal' })

    await expect(adminRequest<{ id: string }>('old-access', 'roles', { method: 'POST', body }))
      .resolves.toEqual({ id: 'role-1' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('http://127.0.0.1:8000/api/v1/identity/sessions/refresh')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'old-refresh' }),
    })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body })
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST', body })
    expect(authorization(fetchMock.mock.calls[2][1])).toBe('Bearer new-access')
    expect(JSON.parse(localStorage.getItem('campusone.session') ?? '{}')).toEqual({
      ...session,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })
  })

  it('deduplicates concurrent refreshes and retries each request once', async () => {
    let resolveRefresh!: (response: Response) => void
    const pendingRefresh = new Promise<Response>((resolve) => { resolveRefresh = resolve })
    let adminCalls = 0
    let refreshCalls = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/sessions/refresh')) {
        refreshCalls += 1
        return pendingRefresh
      }
      adminCalls += 1
      return Promise.resolve(adminCalls <= 2
        ? failure(401, { code: 'TOKEN_EXPIRED' })
        : success({ request: adminCalls }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = adminRequest<{ request: number }>('old-access', 'roles')
    const second = adminRequest<{ request: number }>('old-access', 'staff')
    await vi.waitFor(() => expect(refreshCalls).toBe(1))
    resolveRefresh(success({ accessToken: 'new-access', refreshToken: 'new-refresh' }))

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(refreshCalls).toBe(1)
    expect(adminCalls).toBe(4)
  })

  it('expires the session without refreshing again when the retried request is unauthorized', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(401, { traceId: 'first-trace' }))
      .mockResolvedValueOnce(success({ accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(failure(401, { code: 'STILL_UNAUTHORIZED', traceId: 'retry-trace' }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await adminRequest('old-access', 'roles').catch((cause: unknown) => cause)
    expect(error).toMatchObject({ status: 401, code: 'STILL_UNAUTHORIZED', traceId: 'retry-trace' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(localStorage.getItem('campusone.session')).toBeNull()
  })

  it('clears the session, emits one expiration event, and preserves the original error when refresh fails', async () => {
    const onExpired = vi.fn()
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(401, { code: 'TOKEN_EXPIRED', message: 'Expired.', traceId: 'request-trace' }))
      .mockResolvedValueOnce(new Response('<html>Unauthorized</html>', { status: 401, headers: { 'Content-Type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await adminRequest('old-access', 'roles').catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      name: 'AdminApiError',
      code: 'TOKEN_EXPIRED',
      message: 'Expired.',
      status: 401,
      traceId: 'request-trace',
    })
    expect(localStorage.getItem('campusone.session')).toBeNull()
    expect(onExpired).toHaveBeenCalledOnce()
    window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired)
  })

  it('safely expires malformed persisted sessions without calling refresh', async () => {
    localStorage.setItem('campusone.session', '{not-json')
    const onExpired = vi.fn()
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired)
    const fetchMock = vi.fn().mockResolvedValue(failure(401, { traceId: 'request-trace' }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await adminRequest('old-access', 'roles').catch((cause: unknown) => cause)

    expect(error).toMatchObject({ status: 401, traceId: 'request-trace' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem('campusone.session')).toBeNull()
    expect(onExpired).toHaveBeenCalledOnce()
    window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired)
  })

  it('turns a non-JSON admin response into AdminApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('gateway failure', { status: 502, headers: { 'X-Trace-Id': 'gateway-trace' } }),
    ))

    const error = await adminRequest('old-access', 'roles').catch((cause: unknown) => cause)
    expect(error).toMatchObject({
      name: 'AdminApiError',
      message: 'The request could not be completed.',
      status: 502,
      traceId: 'gateway-trace',
    })
  })

  it('honors abort while waiting for a shared refresh and does not retry the request', async () => {
    let resolveRefresh!: (response: Response) => void
    const pendingRefresh = new Promise<Response>((resolve) => { resolveRefresh = resolve })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(401, { code: 'TOKEN_EXPIRED' }))
      .mockReturnValueOnce(pendingRefresh)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    const request = adminRequest('old-access', 'roles', { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resolveRefresh(success({ accessToken: 'new-access', refreshToken: 'new-refresh' }))
    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem('campusone.session') ?? '{}').accessToken).toBe('new-access')
    })
  })

  it('uses a token already rotated in storage instead of repeatedly refreshing stale caller state', async () => {
    localStorage.setItem('campusone.session', JSON.stringify({
      ...session,
      accessToken: 'already-rotated-access',
      refreshToken: 'already-rotated-refresh',
    }))
    const fetchMock = vi.fn().mockResolvedValue(success({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await adminRequest('old-access', 'roles')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(authorization(fetchMock.mock.calls[0][1])).toBe('Bearer already-rotated-access')
  })
})
