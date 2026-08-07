import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const onboardingSession = {
  success: true,
  data: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: {
      id: 'user-1',
      displayName: 'Aarav Sharma',
      roles: ['INSTITUTE_ADMIN'],
      activeRole: 'INSTITUTE_ADMIN',
      instituteId: 'institute-1',
      branchIds: ['branch-1'],
    },
    onboarding: { completed: true },
  },
}

const otpRequiredResponse = {
  success: false,
  error: {
    code: 'OTP_REQUIRED',
    message: 'Enter the verification code sent to your email.',
    details: {
      challengeId: 'challenge-1',
      expiresAt: '2026-07-18T12:05:00Z',
      destination: 'o****@riverdale.test',
    },
  },
}

async function enterPasswordLogin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'owner@riverdale.test')
  await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

describe('Institute authentication and onboarding', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/login')
  })

  it('uses email and password login without SMS fields', () => {
    render(<App />)

    expect(window.location.pathname).toBe('/login')
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/phone|otp|sms/i)).not.toBeInTheDocument()
  })

  it('shows inline errors before advancing onboarding', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /create your institute/i }))
    expect(window.location.pathname).toBe('/onboarding/account')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText(/complete the required fields/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /your account/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/onboarding/account')
  })

  it('gives every onboarding step a stable URL with browser history support', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /create your institute/i }))
    await user.type(screen.getByLabelText(/full name/i), 'Aarav Sharma')
    await user.type(screen.getByLabelText(/^phone/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(window.location.pathname).toBe('/onboarding/institute')

    await user.type(screen.getByLabelText(/legal name/i), 'Riverdale International School')
    await user.type(screen.getByLabelText(/display name/i), 'Riverdale')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(window.location.pathname).toBe('/onboarding/legal-documents')

    window.history.back()
    expect(await screen.findByRole('heading', { name: /institute identity/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/onboarding/institute')
  })

  it.each([
    ['/onboarding/account', 'Your account', false],
    ['/onboarding/institute', 'Institute identity', false],
    ['/onboarding/legal-documents', 'Legal & documents', false],
    ['/onboarding/contact', 'Head office & contact', false],
    ['/onboarding/scale', 'Scale & plan', false],
    ['/onboarding/branch', 'First branch', true],
    ['/onboarding/review', 'Review & consent', false],
  ])('restores the directly opened onboarding route %s', async (path, heading, hasBranches) => {
    if (hasBranches) localStorage.setItem('campusone.onboarding-draft', JSON.stringify({ hasBranches: true }))
    window.history.pushState({}, '', path)
    render(<App />)

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(window.location.pathname).toBe(path)
  })

  it('completes an OTP challenge after password authentication', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/identity/sessions')) {
        return new Response(JSON.stringify(otpRequiredResponse), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(onboardingSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    render(<App />)

    await enterPasswordLogin(user)

    expect(await screen.findByRole('heading', { name: /verify your identity/i })).toBeInTheDocument()
    expect(screen.getByText(/o\*{4}@riverdale\.test/i)).toBeInTheDocument()
    const codeInput = screen.getByRole('textbox', { name: /verification code/i })
    expect(codeInput).toHaveAttribute('inputmode', 'numeric')
    expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')

    await user.type(codeInput, '12a34567')
    expect(codeInput).toHaveValue('123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    expect(JSON.parse(localStorage.getItem('campusone.session') ?? '{}').accessToken).toBe(
      'access-token',
    )
    const verificationCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/api/v1/identity/sessions/otp'))
    expect(JSON.parse(String((verificationCall?.[1] as RequestInit).body))).toEqual({
      challengeId: 'challenge-1',
      code: '123456',
    })
  })

  it('shows OTP errors, resends with a replacement challenge, and returns to sign in', async () => {
    const user = userEvent.setup()
    let verificationAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/identity/sessions')) {
        return new Response(JSON.stringify(otpRequiredResponse), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/v1/identity/sessions/otp/resend')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            challengeId: 'challenge-2',
            expiresAt: '2026-07-18T12:10:00Z',
            destination: 'o****@riverdale.test',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      verificationAttempts += 1
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'OTP_INVALID_CODE', message: 'The verification code is incorrect.' },
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    })
    render(<App />)
    await enterPasswordLogin(user)

    await user.click(await screen.findByRole('button', { name: /verify code/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/enter the 6-digit/i)
    expect(verificationAttempts).toBe(0)

    await user.type(screen.getByRole('textbox', { name: /verification code/i }), '000000')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/i)

    await user.click(screen.getByRole('button', { name: /resend code/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/new verification code has been sent/i)
    expect(screen.getByRole('textbox', { name: /verification code/i })).toHaveValue('')
    const resendCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/otp/resend'))
    expect(JSON.parse(String((resendCall?.[1] as RequestInit).body))).toEqual({
      challengeId: 'challenge-1',
    })

    await user.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^email$/i })).toHaveValue('owner@riverdale.test')
  })
})
