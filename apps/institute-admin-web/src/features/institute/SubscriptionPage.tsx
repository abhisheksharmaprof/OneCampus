import { useEffect, useState } from 'react'
import { CreditCard, RefreshCw } from 'lucide-react'
import { adminRequest } from '../admin/admin.api'
import './subscription.css'

interface SubscriptionPlan {
  id: string
  name: string
  pricePerStudent: string
  flatFee: string
  maxBranches: number
  maxStudents: number
  features: string[]
}

interface InstituteSubscription {
  id: string
  status: 'trial' | 'active' | string
  trialEndsAt: string
  createdAt: string
  plan: SubscriptionPlan
}

interface SubscriptionResponse {
  subscription: InstituteSubscription | null
}

const money = (value: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value || 0))

export function SubscriptionPage({ accessToken }: { accessToken: string }) {
  const [subscription, setSubscription] = useState<InstituteSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void adminRequest<SubscriptionResponse>(accessToken, 'institute/subscription', { signal: controller.signal })
      .then((response) => setSubscription(response.subscription))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Subscription details could not be loaded.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, revision])

  const plan = subscription?.plan
  const statusLabel = subscription?.status === 'trial' ? 'Trial' : subscription?.status === 'active' ? 'Active' : subscription?.status

  return <main className="entity-page subscription-page">
    <header className="subscription-heading">
      <div><p className="breadcrumb">Home　›　Institute Setup　›　Subscription</p><h1>Subscription &amp; Billing</h1><p>View the subscription assigned to this institute.</p></div>
    </header>
    {error ? <div className="subscription-state" role="alert"><p>{error}</p><button className="button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} /> Retry</button></div> : loading ? <div className="subscription-state" role="status">Loading subscription details…</div> : subscription && plan ? <>
      <section className="subscription-kpis" aria-label="Subscription summary">
        <article className="subscription-card"><span className="section-caption">Current plan</span><strong>{plan.name}</strong><small>{statusLabel}</small></article>
        <article className="subscription-card"><span className="section-caption">Student limit</span><strong>{plan.maxStudents.toLocaleString('en-IN')}</strong><small>Plan maximum</small></article>
        <article className="subscription-card"><span className="section-caption">Branch limit</span><strong>{plan.maxBranches.toLocaleString('en-IN')}</strong><small>Plan maximum</small></article>
      </section>
      <div className="subscription-columns">
        <section className="subscription-card plan-card">
          <span className="active-plan">{statusLabel}</span><h2>{plan.name}</h2>
          <p>Subscription started {new Date(subscription.createdAt).toLocaleDateString('en-IN')}.</p>
          <p className="billing-row"><span>Flat plan fee</span><b>{money(plan.flatFee)}</b></p>
          <p className="billing-row"><span>Fee per student</span><b>{money(plan.pricePerStudent)}</b></p>
          <p className="billing-row"><span>Trial ends</span><b>{subscription.status === 'trial' ? new Date(subscription.trialEndsAt).toLocaleDateString('en-IN') : 'Not applicable'}</b></p>
          <p className="subscription-help">Plan changes and subscription invoices are managed by the CampusOne platform team.</p>
        </section>
        <section className="subscription-card">
          <h2>Included features</h2>
          {plan.features.length ? <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul> : <p>No feature details are configured for this plan.</p>}
        </section>
      </div>
      <section className="subscription-card subscription-history"><h2>Invoice history</h2><p>Subscription invoice history is not available in the institute workspace.</p></section>
    </> : <section className="subscription-card subscription-empty" aria-labelledby="subscription-empty-title">
      <CreditCard aria-hidden="true" />
      <h2 id="subscription-empty-title">No subscription assigned</h2>
      <p>There is no subscription record linked to this institute. Contact the CampusOne platform administrator to assign or review a plan.</p>
    </section>}
  </main>
}
