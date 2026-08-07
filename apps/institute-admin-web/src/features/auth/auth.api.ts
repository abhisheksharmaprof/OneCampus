export interface SessionUser {
  id: string
  displayName: string
  roles: string[]
  activeRole: string
  instituteId: string
  branchIds: string[]
  permissions?: string[]
}

export interface SessionData {
  accessToken: string
  refreshToken: string
  user: SessionUser
  onboarding?: { completed: boolean; status?: string; instituteName?: string; slug?: string; publicUrl?: string; rejectionReason?: string }
}

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error?: {
    code?: string
    message?: string
    fieldErrors?: Record<string, string[] | string>
    details?: Record<string, unknown>
  }
}

export interface OtpChallenge {
  challengeId: string
  expiresAt: string
  destination: string
}

export interface PublicInstituteConfig {
  slug: string
  name: string
  logoUrl: string
  brandColor: string
  status: string
  publicUrl: string
}

export class ApiError extends Error {
  code: string
  fieldErrors: Record<string, string>
  details: Record<string, unknown>

  constructor(
    message: string,
    code = 'REQUEST_FAILED',
    fieldErrors: Record<string, string> = {},
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : (() => {
      // In production builds, refuse to use a default HTTP endpoint —
      // the environment variable MUST be set explicitly.
      if (import.meta.env.PROD) {
        throw new Error(
          'VITE_API_BASE_URL is required in production. '
          + 'Set it to your HTTPS API endpoint (e.g. https://api.campusone.example).',
        )
      }
      return 'http://127.0.0.1:8000'
    })()

function normalizeFieldErrors(errors: Record<string, string[] | string> | undefined) {
  return Object.fromEntries(
    Object.entries(errors ?? {}).map(([field, value]) => [
      field,
      Array.isArray(value) ? String(value[0] ?? '') : String(value),
    ]),
  )
}

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure
  if (!response.ok || !payload.success) {
    const error = 'error' in payload ? payload.error : undefined
    throw new ApiError(
      error?.message ?? 'The request could not be completed. Please try again.',
      error?.code,
      normalizeFieldErrors(error?.fieldErrors),
      error?.details,
    )
  }
  return payload.data
}

export function signIn(email: string, password: string) {
  return post<SessionData>('/api/v1/identity/sessions', {
    email,
    password,
    client: 'admin-web',
  })
}

export function verifyOtp(challengeId: string, code: string) {
  return post<SessionData>('/api/v1/identity/sessions/otp', { challengeId, code })
}

export function resendOtp(challengeId: string) {
  return post<OtpChallenge>('/api/v1/identity/sessions/otp/resend', { challengeId })
}

export async function signOut(accessToken: string, refreshToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/identity/sessions/current`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  })
  const payload = (await response.json()) as ApiSuccess<{ signedOut: boolean }> | ApiFailure
  if (!response.ok || !payload.success) {
    const error = 'error' in payload ? payload.error : undefined
    throw new ApiError(
      error?.message ?? 'The session could not be signed out securely.',
      error?.code,
    )
  }
}

export function createInstitute(input: {
  instituteName: string
  branchName: string
  adminName: string
  email: string
  password: string
}) {
  return post<SessionData & { onboarding: { completed: boolean } }>(
    '/api/v1/institute-onboarding/registrations',
    input,
  )
}

export function submitInstituteApplication(input: object) {
  return post<SessionData & { onboarding: { completed: boolean; status: string; instituteName?: string } }>(
    '/api/v1/institute-onboarding/applications', input,
  )
}

export async function getPublicInstituteConfig(slug: string): Promise<PublicInstituteConfig> {
  const response = await fetch(`${apiBaseUrl}/api/v1/institute-onboarding/public/${encodeURIComponent(slug)}`)
  const payload = (await response.json()) as ApiSuccess<PublicInstituteConfig> | ApiFailure
  if (!response.ok || !payload.success) throw new ApiError('Institute branding could not be loaded.')
  return payload.data
}
