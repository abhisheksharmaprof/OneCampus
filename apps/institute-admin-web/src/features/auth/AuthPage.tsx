import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, GraduationCap } from 'lucide-react'
import {
  ApiError,
  createInstitute,
  requestPasswordReset,
  confirmPasswordReset,
  resendOtp,
  signIn,
  verifyOtp,
  type OtpChallenge,
  type SessionData,
  getPublicInstituteConfig,
  type PublicInstituteConfig,
} from './auth.api'
import { OnboardingWizard } from './OnboardingWizard'

type AuthMode = 'login' | 'onboarding'
type FieldErrors = Record<string, string>

interface AuthPageProps {
  mode: AuthMode
  onboardingStep?: string
  onNavigate: (path: string) => void
  onAuthenticated: (session: SessionData) => void
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field({
  label,
  name,
  type = 'text',
  value,
  autoComplete,
  error,
  onChange,
}: {
  label: string
  name: string
  type?: string
  value: string
  autoComplete?: string
  error?: string
  onChange: (value: string) => void
}) {
  const errorId = `${name}-error`
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="auth-field-error" id={errorId}>{error}</span> : null}
    </label>
  )
}

export function AuthPage({ mode, onboardingStep, onNavigate, onAuthenticated }: AuthPageProps) {
  const [searchParams] = useSearchParams()
  const resetUid = searchParams.get('uid') ?? ''
  const resetToken = searchParams.get('token') ?? ''
  const [authView, setAuthView] = useState<'login' | 'forgot' | 'reset'>(resetUid && resetToken ? 'reset' : 'login')
  const [step, setStep] = useState(1)
  const [values, setValues] = useState({
    instituteName: '',
    branchName: 'Main Campus',
    adminName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpNotice, setOtpNotice] = useState('')
  const [resending, setResending] = useState(false)
  const [instituteBrand, setInstituteBrand] = useState<PublicInstituteConfig | null>(null)
  const [resetNotice, setResetNotice] = useState('')

  useEffect(() => {
    if (mode !== 'login') return
    const host = window.location.hostname.toLowerCase()
    const parts = host.split('.')
    if (parts.length < 3 || ['www', 'admin', 'api', 'localhost'].includes(parts[0])) return
    void getPublicInstituteConfig(parts[0]).then(setInstituteBrand).catch(() => setInstituteBrand(null))
  }, [mode])

  const update = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      delete next.credentials
      return next
    })
    setServerError('')
  }

  const openOnboarding = () => {
    setOtpChallenge(null)
    setStep(1)
    setErrors({})
    setServerError('')
    onNavigate('/onboarding/account')
  }

  const openLogin = () => {
    setOtpChallenge(null)
    setOtpCode('')
    setOtpError('')
    setOtpNotice('')
    setErrors({})
    setServerError('')
    setResetNotice('')
    setAuthView('login')
    onNavigate('/login')
  }

  const submitForgotPassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!emailPattern.test(values.email.trim())) { setErrors({ email: 'Enter a valid email address.' }); return }
    setSubmitting(true); setServerError('')
    try { setResetNotice((await requestPasswordReset(values.email.trim())).message) }
    catch (error) { setServerError(error instanceof ApiError ? error.message : 'Unable to request a password reset.') }
    finally { setSubmitting(false) }
  }

  const submitResetPassword = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: FieldErrors = {}
    if (values.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    if (values.password !== values.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'
    setErrors(nextErrors); if (Object.keys(nextErrors).length) return
    setSubmitting(true); setServerError('')
    try { setResetNotice((await confirmPasswordReset(resetUid, resetToken, values.password, values.confirmPassword)).message); setAuthView('login') }
    catch (error) { setServerError(error instanceof ApiError ? error.message : 'Unable to reset your password.') }
    finally { setSubmitting(false) }
  }

  const continueOnboarding = () => {
    const nextErrors: FieldErrors = {}
    if (!values.instituteName.trim()) nextErrors.instituteName = 'Institute name is required.'
    if (!values.branchName.trim()) nextErrors.branchName = 'Main branch name is required.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) setStep(2)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: FieldErrors = {}
    if (!emailPattern.test(values.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!values.password) nextErrors.password = 'Password is required.'
    if (mode === 'onboarding') {
      if (!values.adminName.trim()) nextErrors.adminName = 'Your full name is required.'
      if (values.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
      if (values.confirmPassword !== values.password) {
        nextErrors.confirmPassword = 'Passwords do not match.'
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      const session = mode === 'login'
        ? await signIn(values.email.trim(), values.password)
        : await createInstitute({
            instituteName: values.instituteName.trim(),
            branchName: values.branchName.trim(),
            adminName: values.adminName.trim(),
            email: values.email.trim(),
            password: values.password,
          })
      onAuthenticated(session)
    } catch (error) {
      if (error instanceof ApiError) {
        if (mode === 'login' && error.code === 'OTP_REQUIRED') {
          const { challengeId, expiresAt, destination } = error.details
          if (
            typeof challengeId === 'string'
            && typeof expiresAt === 'string'
            && typeof destination === 'string'
          ) {
            setOtpChallenge({ challengeId, expiresAt, destination })
            setOtpCode('')
            setOtpError('')
            setOtpNotice('')
            return
          }
        }
        setErrors(error.fieldErrors)
        setServerError(error.message)
      } else {
        setServerError('Unable to connect to CampusOne. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (!otpChallenge) return
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError('Enter the 6-digit verification code.')
      return
    }

    setSubmitting(true)
    setOtpError('')
    setOtpNotice('')
    try {
      onAuthenticated(await verifyOtp(otpChallenge.challengeId, otpCode))
    } catch (error) {
      setOtpError(
        error instanceof ApiError
          ? error.fieldErrors.code ?? error.message
          : 'Unable to verify the code. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    if (!otpChallenge) return
    setResending(true)
    setOtpError('')
    setOtpNotice('')
    try {
      setOtpChallenge(await resendOtp(otpChallenge.challengeId))
      setOtpCode('')
      setOtpNotice('A new verification code has been sent.')
    } catch (error) {
      setOtpError(
        error instanceof ApiError
          ? error.message
          : 'Unable to resend the code. Please try again.',
      )
    } finally {
      setResending(false)
    }
  }

  if (mode === 'onboarding') return <OnboardingWizard stepId={onboardingStep} onStepChange={(stepId) => onNavigate(`/onboarding/${stepId}`)} onAuthenticated={onAuthenticated} onExit={openLogin} />

  return (
    <main className="auth-page">
      <section className="auth-aside" aria-label="CampusOne introduction">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><GraduationCap /></span>
          <span>{instituteBrand?.name || 'CampusOne'}</span>
        </div>
        <div className="auth-aside-copy">
          <p className="auth-eyebrow">School operations, connected</p>
          <h1>One place for every branch, classroom, and family.</h1>
          <p>Set up your institute, invite your team, and keep parents informed from day one.</p>
          <ul>
            <li><Check aria-hidden="true" /> Multi-branch administration</li>
            <li><Check aria-hidden="true" /> Attendance and academic reporting</li>
            <li><Check aria-hidden="true" /> Parent and staff apps</li>
          </ul>
        </div>
      </section>

      <section
        className="auth-panel"
        aria-label={otpChallenge ? 'OTP verification' : mode === 'login' ? 'Institute sign in' : 'Institute onboarding'}
      >
        <div className="auth-card">
          {otpChallenge ? (
            <>
              <button className="auth-back" type="button" onClick={openLogin}>
                <ArrowLeft aria-hidden="true" /> Back to sign in
              </button>
              <div className="auth-heading">
                <p className="auth-eyebrow">Security check</p>
                <h1>Verify your identity</h1>
                <p>Enter the 6-digit code sent to {otpChallenge.destination}.</p>
              </div>
              <form className="auth-form" onSubmit={submitOtp} noValidate>
                <label className="auth-field">
                  <span>Verification code</span>
                  <input
                    name="otpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    value={otpCode}
                    aria-invalid={Boolean(otpError)}
                    aria-describedby={otpError ? 'otp-code-error' : undefined}
                    onChange={(event) => {
                      setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                      setOtpError('')
                      setOtpNotice('')
                    }}
                  />
                  {otpError ? <span className="auth-field-error" id="otp-code-error" role="alert">{otpError}</span> : null}
                </label>
                {otpNotice ? <p className="auth-helper" role="status">{otpNotice}</p> : null}
                <button className="auth-primary-button" type="submit" disabled={submitting || resending}>
                  {submitting ? 'Verifying…' : 'Verify code'}
                </button>
              </form>
              <div className="auth-switch">
                <span>Didn&apos;t receive it?</span>
                <button type="button" disabled={submitting || resending} onClick={resend}>
                  {resending ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            </>
          ) : mode === 'login' && authView === 'login' ? (
            <>
              <div className="auth-heading">
                {instituteBrand?.logoUrl ? <img className="auth-institute-logo" src={instituteBrand.logoUrl} alt={`${instituteBrand.name} logo`} /> : null}
                <p className="auth-eyebrow">{instituteBrand?.name || 'Institute Admin'}</p>
                <h1>Welcome back</h1>
                <p>Sign in with your work email and password.</p>
              </div>
              <form className="auth-form" onSubmit={submit} noValidate>
                <Field label="Email" name="email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={(value) => update('email', value)} />
                <Field label="Password" name="password" type="password" autoComplete="current-password" value={values.password} error={errors.password ?? errors.credentials} onChange={(value) => update('password', value)} />
                {serverError ? <div className="auth-global-error" role="alert">{serverError}</div> : null}
                <button className="auth-primary-button" type="submit" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <button className="auth-link-button" type="button" onClick={() => { setAuthView('forgot'); setServerError(''); setErrors({}); setResetNotice('') }}>Forgot password?</button>
              <div className="auth-switch">
                <span>New to CampusOne?</span>
                <button type="button" onClick={openOnboarding}>Create your institute</button>
              </div>
            </>
          ) : authView === 'forgot' ? (
            <>
              <button className="auth-back" type="button" onClick={openLogin}><ArrowLeft aria-hidden="true" /> Back to sign in</button>
              <div className="auth-heading"><p className="auth-eyebrow">Account recovery</p><h1>Forgot your password?</h1><p>Enter your work email and we’ll send you a reset link.</p></div>
              <form className="auth-form" onSubmit={submitForgotPassword} noValidate><Field label="Work email" name="email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={(value) => update('email', value)} />{serverError ? <div className="auth-global-error" role="alert">{serverError}</div> : null}{resetNotice ? <p className="auth-helper" role="status">{resetNotice}</p> : null}<button className="auth-primary-button" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send reset link'}</button></form>
            </>
          ) : authView === 'reset' ? (
            <>
              <button className="auth-back" type="button" onClick={openLogin}><ArrowLeft aria-hidden="true" /> Back to sign in</button>
              <div className="auth-heading"><p className="auth-eyebrow">Account recovery</p><h1>Set a new password</h1><p>Choose a new password for your CampusOne account.</p></div>
              <form className="auth-form" onSubmit={submitResetPassword} noValidate><Field label="New password" name="password" type="password" autoComplete="new-password" value={values.password} error={errors.password} onChange={(value) => update('password', value)} /><Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" value={values.confirmPassword} error={errors.confirmPassword} onChange={(value) => update('confirmPassword', value)} />{serverError ? <div className="auth-global-error" role="alert">{serverError}</div> : null}<button className="auth-primary-button" type="submit" disabled={submitting}>{submitting ? 'Updating…' : 'Update password'}</button></form>
            </>
          ) : (
            <>
              <button className="auth-back" type="button" onClick={step === 1 ? openLogin : () => setStep(1)}>
                <ArrowLeft aria-hidden="true" /> {step === 1 ? 'Back to sign in' : 'Back'}
              </button>
              <div className="auth-heading">
                <p className="auth-eyebrow">Step {step} of 2</p>
                <h1>Set up your institute</h1>
                <p>{step === 1 ? 'Start with your institute and main branch.' : 'Create the first Institute Admin account.'}</p>
              </div>
              {step === 1 ? (
                <div className="auth-form">
                  <Field label="Institute name" name="instituteName" value={values.instituteName} error={errors.instituteName} onChange={(value) => update('instituteName', value)} />
                  <Field label="Main branch name" name="branchName" value={values.branchName} error={errors.branchName} onChange={(value) => update('branchName', value)} />
                  <p className="auth-helper">Institute and branch codes are generated automatically.</p>
                  <button className="auth-primary-button" type="button" onClick={continueOnboarding}>Continue</button>
                </div>
              ) : (
                <form className="auth-form" onSubmit={submit} noValidate>
                  <Field label="Your full name" name="adminName" autoComplete="name" value={values.adminName} error={errors.adminName} onChange={(value) => update('adminName', value)} />
                  <Field label="Work email" name="email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={(value) => update('email', value)} />
                  <Field label="Password" name="password" type="password" autoComplete="new-password" value={values.password} error={errors.password} onChange={(value) => update('password', value)} />
                  <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" value={values.confirmPassword} error={errors.confirmPassword} onChange={(value) => update('confirmPassword', value)} />
                  {serverError ? <div className="auth-global-error" role="alert">{serverError}</div> : null}
                  <button className="auth-primary-button" type="submit" disabled={submitting}>
                    {submitting ? 'Creating institute…' : 'Create institute'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
