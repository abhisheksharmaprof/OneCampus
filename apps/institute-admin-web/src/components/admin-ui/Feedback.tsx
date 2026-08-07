import { AlertTriangle, Inbox, X } from 'lucide-react'
import { Skeleton as BoneyardSkeleton } from 'boneyard-js/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastInput } from './toast-context'

export type { ToastInput, ToastTone } from './toast-context'

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="admin-state admin-empty-state">
      <div className="admin-state__icon" aria-hidden="true">{icon ?? <Inbox />}</div>
      <h2>{title}</h2>
      {description ? <div className="admin-state__description">{description}</div> : null}
      {action ? <div className="admin-state__action">{action}</div> : null}
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  message: ReactNode
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div className="admin-state admin-error-state" role="alert">
      <div className="admin-state__icon" aria-hidden="true"><AlertTriangle /></div>
      <h2>{title}</h2>
      <div className="admin-state__description">{message}</div>
      {onRetry ? <button className="admin-button admin-button--secondary" type="button" onClick={onRetry}>{retryLabel}</button> : null}
    </div>
  )
}

export interface SkeletonProps {
  width?: string
  height?: string
  className?: string
}

/**
 * Boneyard-backed screen loader. The CLI snapshots the content passed as
 * `children` and the generated registry is used for pixel-aligned bones at
 * runtime. `fallback` keeps loading usable before the first registry build.
 */
export function BoneScreen({ name, loading, children, fallback, label = 'Loading' }: {
  name: string
  loading: boolean
  children: ReactNode
  fallback?: ReactNode
  label?: string
}) {
  return (
    <div role="status" aria-label={label}>
      <span className="admin-sr-only">{label}</span>
      <BoneyardSkeleton
        name={name}
        loading={loading}
        select="viewport"
        animate="shimmer"
        transition
        fallback={fallback ?? children}
      >
        {children}
      </BoneyardSkeleton>
    </div>
  )
}

export function Skeleton({ width, height, className = '' }: SkeletonProps) {
  return <span className={`admin-skeleton ${className}`.trim()} style={{ width, height }} aria-hidden="true" />
}

function SkeletonLines({ count = 3, className = '' }: { count?: number; className?: string }) {
  return <div className={`admin-skeleton-lines ${className}`.trim()}>{Array.from({ length: count }, (_, index) => <Skeleton key={index} height="0.875rem" width={index === count - 1 ? '62%' : index % 2 ? '82%' : '100%'} />)}</div>
}

export function PageSkeleton({ label = 'Loading page', variant = 'list', name }: { label?: string; variant?: 'list' | 'detail' | 'form'; name?: string }) {
  const content = (
    <div className={`admin-page-skeleton admin-page-skeleton--${variant}`}>
      <div className="admin-page-skeleton__heading"><Skeleton width="38%" height="0.75rem" /><Skeleton width="54%" height="2rem" /></div>
      {variant === 'detail' ? <><div className="admin-page-skeleton__hero"><Skeleton width="4rem" height="4rem" className="is-circle" /><SkeletonLines count={3} /></div><div className="admin-page-skeleton__grid">{Array.from({ length: 6 }, (_, index) => <div className="admin-page-skeleton__field" key={index}><Skeleton width="42%" height="0.75rem" /><Skeleton height="2.75rem" /></div>)}</div></> : variant === 'form' ? <div className="admin-page-skeleton__grid">{Array.from({ length: 8 }, (_, index) => <div className="admin-page-skeleton__field" key={index}><Skeleton width={index % 2 ? '34%' : '46%'} height="0.75rem" /><Skeleton height="2.75rem" /></div>)}</div> : <div className="admin-page-skeleton__table"><div className="admin-page-skeleton__table-head"><Skeleton width="24%" height="0.75rem" /><Skeleton width="18%" height="0.75rem" /><Skeleton width="18%" height="0.75rem" /><Skeleton width="14%" height="0.75rem" /></div>{Array.from({ length: 6 }, (_, index) => <div className="admin-page-skeleton__table-row" key={index}><Skeleton width={index % 2 ? '72%' : '88%'} height="0.875rem" /><Skeleton width="58%" height="0.875rem" /><Skeleton width="46%" height="0.875rem" /><Skeleton width="64%" height="0.875rem" /></div>)}</div>}
    </div>
  )
  return <BoneScreen name={name ?? `page-${variant}`} loading label={label} fallback={content}>{content}</BoneScreen>
}

export function DashboardSkeleton() {
  const content = (
    <div className="dashboard-page admin-dashboard-skeleton">
      <div className="page-heading"><div><Skeleton width="5rem" height="0.75rem" /><Skeleton width="12rem" height="2rem" /></div></div>
      <div className="admin-dashboard-skeleton__context"><Skeleton width="13rem" height="1.25rem" /><Skeleton width="18rem" height="0.875rem" /></div>
      <div className="kpi-grid">{Array.from({ length: 5 }, (_, index) => <div className="card kpi-card" key={index}><Skeleton width="58%" height="0.75rem" /><Skeleton width="42%" height="2rem" /><Skeleton width="72%" height="0.75rem" /></div>)}</div>
      <div className="admin-dashboard-skeleton__columns"><div className="card"><Skeleton width="42%" height="1.25rem" /><SkeletonLines count={4} /></div><div className="card"><Skeleton width="32%" height="1.25rem" /><SkeletonLines count={4} /></div></div>
      <div className="card admin-dashboard-skeleton__funnel"><Skeleton width="35%" height="1.25rem" /><div className="admin-dashboard-skeleton__bars">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} width={`${45 + index * 13}%`} height="2rem" />)}</div></div>
    </div>
  )
  return <BoneScreen name="dashboard" loading label="Loading dashboard" fallback={content}>{content}</BoneScreen>
}

export function LoadingState({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="admin-loading-state" role="status" aria-label={label}>
      <span className="admin-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} height="1rem" width={index % 2 ? '72%' : '100%'} />)}
    </div>
  )
}

interface ToastRecord extends ToastInput { id: string }
let toastSequence = 0

export function ToastProvider({ children, defaultDuration = 5000 }: { children: ReactNode; defaultDuration?: number }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((input: ToastInput) => {
    const id = `admin-toast-${++toastSequence}`
    const toast = { tone: 'success' as const, ...input, id }
    setToasts((current) => [...current, toast])
    const duration = input.duration ?? defaultDuration
    if (duration > 0) timers.current.set(id, setTimeout(() => dismissToast(id), duration))
    return id
  }, [defaultDuration, dismissToast])

  useEffect(() => {
    const activeTimers = timers.current
    return () => activeTimers.forEach((timer) => clearTimeout(timer))
  }, [])

  const value = useMemo(() => ({ addToast, dismissToast }), [addToast, dismissToast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="admin-toast-region" aria-label="Notifications" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <div className={`admin-toast admin-toast--${toast.tone ?? 'success'}`} role={toast.tone === 'error' ? 'alert' : 'status'} key={toast.id}>
            <div><strong>{toast.title}</strong>{toast.message ? <p>{toast.message}</p> : null}</div>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label={`Dismiss ${toast.title}`}><X aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
