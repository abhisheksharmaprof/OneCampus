import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AdminApiError } from '../../admin/admin.api'

export type FinanceSectionProps = { accessToken: string; branchId?: string; onNavigate: (path: string) => void }

export const money = (value: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(typeof value === 'number' ? value : Number(value || 0))

export function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) return error.message
  return 'Something went wrong while loading data.'
}

/** Standard loader: AbortController + revision counter, matching the app-wide pattern. */
export function useAbortableLoad<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    loader(controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setData(result); setLoading(false) } })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(errorMessage(cause))
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision])

  return { data, loading, error, reload }
}

export function StatePanel(props: {
  loading: boolean
  error: string | null
  onRetry: () => void
  empty?: boolean
  emptyMessage?: string
  children: ReactNode
}) {
  if (props.loading) return <div className="fin-state fin-state--loading" role="status">Loading…</div>
  if (props.error) {
    return (
      <div className="fin-state fin-state--error" role="alert">
        <p>{props.error}</p>
        <button type="button" className="fin-btn" onClick={props.onRetry}>Retry</button>
      </div>
    )
  }
  if (props.empty) return <div className="fin-state fin-state--empty">{props.emptyMessage ?? 'Nothing here yet.'}</div>
  return <>{props.children}</>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`fin-badge fin-badge--${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>
}

export function Pagination(props: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (props.totalPages <= 1) return null
  return (
    <div className="fin-pagination">
      <button type="button" className="fin-btn" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>Previous</button>
      <span>Page {props.page} of {props.totalPages}</span>
      <button type="button" className="fin-btn" disabled={props.page >= props.totalPages} onClick={() => props.onPage(props.page + 1)}>Next</button>
    </div>
  )
}
