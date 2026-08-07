import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, GraduationCap } from 'lucide-react'
import { ApiError, submitInstituteApplication, type SessionData } from './auth.api'

type Props = { stepId?: string; onStepChange: (stepId: string) => void; onAuthenticated: (session: SessionData) => void; onExit: () => void }
type Values = { fullName: string; email: string; password: string; confirmPassword: string; legalName: string; displayName: string; slug: string; terms: boolean }

const steps = ['account', 'institute', 'review'] as const

export function OnboardingWizard({ stepId, onStepChange, onAuthenticated, onExit }: Props) {
  const [values, setValues] = useState<Values>(() => {
    try { return { fullName: '', email: '', password: '', confirmPassword: '', legalName: '', displayName: '', slug: '', terms: false, ...JSON.parse(localStorage.getItem('campusone.onboarding-draft') ?? '{}') } } catch { return { fullName: '', email: '', password: '', confirmPassword: '', legalName: '', displayName: '', slug: '', terms: false } }
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const step = Math.max(0, steps.indexOf((stepId ?? 'account') as typeof steps[number]))
  const update = (key: keyof Values, value: string | boolean) => setValues((current) => { const next = { ...current, [key]: value }; localStorage.setItem('campusone.onboarding-draft', JSON.stringify(next)); return next })
  useEffect(() => { if (!steps.includes((stepId ?? 'account') as typeof steps[number])) onStepChange('account') }, [onStepChange, stepId])
  const input = (label: string, key: keyof Values, type = 'text', hint?: string) => <label className="onboard-field"><span>{label}<b>Required</b></span><input type={type} value={String(values[key])} autoComplete={type === 'password' ? 'new-password' : undefined} onChange={(event) => update(key, event.target.value)} />{hint && <small className="onboard-note">{hint}</small>}</label>
  const validate = () => {
    if (step === 0 && (!values.fullName.trim() || !values.email.trim() || values.password.length < 8 || values.password !== values.confirmPassword)) return 'Enter your name, a valid email, and matching password of at least 8 characters.'
    if (step === 1 && (!values.legalName.trim() || !values.displayName.trim() || !/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/.test(values.slug))) return 'Enter the institute name and a URL name using lowercase letters, numbers, or hyphens.'
    if (step === 2 && !values.terms) return 'Accept the Terms of Service and confirm that you are authorized to register this institute.'
    return ''
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const validation = validate(); if (validation) { setError(validation); return }
    if (step < 2) { setError(''); onStepChange(steps[step + 1]); return }
    setBusy(true); setError('')
    try {
      const session = await submitInstituteApplication({ account: { fullName: values.fullName, email: values.email, password: values.password }, institute: { legalName: values.legalName, displayName: values.displayName, slug: values.slug }, consents: { authorized: true, terms: true } })
      localStorage.removeItem('campusone.onboarding-draft'); onAuthenticated(session)
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'We could not submit your application. Please try again.') } finally { setBusy(false) }
  }
  return <main className="onboarding-page"><header className="onboarding-header"><span className="onboarding-brand"><GraduationCap /> CampusOne</span><button type="button" onClick={() => { localStorage.setItem('campusone.onboarding-draft', JSON.stringify(values)); onExit() }}>Save &amp; exit</button></header><section className="onboarding-wrap"><div className="wizard-progress"><span>Step {step + 1} of 3</span><div><i style={{ width: `${((step + 1) / 3) * 100}%` }} /></div></div><h1>{step === 0 ? 'Create your account' : step === 1 ? 'Name your institute' : 'Review and submit'}</h1><p className="onboarding-intro">{step === 0 ? 'We only need the essentials to start your application.' : step === 1 ? 'You can complete address, legal, branch, and branding details after approval.' : 'Your application will be reviewed by a CampusOne platform administrator.'}</p><form onSubmit={submit} className="onboarding-form">{step === 0 && <><div className="onboard-grid">{input('Full name', 'fullName')}{input('Work email', 'email', 'email')}</div>{input('Password', 'password', 'password', 'Use at least 8 characters.')}{input('Confirm password', 'confirmPassword', 'password')}</>}{step === 1 && <><div className="onboard-grid">{input('Legal institute name', 'legalName')}{input('Display name', 'displayName', 'text', 'Shown to staff, parents, and students.')}</div>{input('Institute URL name', 'slug', 'text', `${values.slug || 'your-institute'}.arkailabs.com — this must be unique and cannot be changed casually later.`)}<p className="onboard-note">Remaining details—address, board, legal documents, branches, logo, and academic defaults—can be completed in Institute Details after approval.</p></>}{step === 2 && <><div className="review-card"><h2>{values.displayName || values.legalName}</h2><p>{values.slug}.arkailabs.com</p><p className="onboard-note">Application owner: {values.fullName} · {values.email}</p></div><label className="onboard-check"><input type="checkbox" checked={values.terms} onChange={(event) => update('terms', event.target.checked)} /> I confirm I’m authorized to register this institute and agree to the Terms of Service.</label></>}{error && <p className="auth-global-error" role="alert">{error}</p>}<footer className="onboard-footer">{step > 0 && <button type="button" className="secondary" onClick={() => onStepChange(steps[step - 1])}><ArrowLeft /> Back</button>}<button className="auth-primary-button" type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 2 ? 'Submit for review' : 'Continue'}</button></footer></form></section></main>
}
