import { useEffect, useMemo, useState } from 'react'
import { Download, FileSearch, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { adminRequest, type PageData } from '../admin/admin.api'
import './audit-log.css'

type AuditEntry = {
  id: string
  timestamp: string
  event_type: string
  message: string
  actor: { id: string | null; name: string }
  branch: { id: string; name: string } | null
  metadata: Record<string, unknown>
}

type Props = { accessToken: string; selectedBranch: string }
const emptyPage: PageData<AuditEntry> = { count: 0, page: 1, pageSize: 25, totalPages: 1, next: null, previous: null, items: [] }
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function AuditLogPage({ accessToken }: Props) {
  const [data, setData] = useState<PageData<AuditEntry>>(emptyPage)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (search.trim()) params.set('search', search.trim())
    void adminRequest<PageData<AuditEntry>>(accessToken, `audit-log?${params}`, { signal: controller.signal })
      .then((response) => { setData(response); setError('') })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Audit log could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, page, revision, search])

  const exportCsv = async () => {
    const headers = ['Timestamp', 'User', 'Action', 'Message', 'Branch', 'Status']
    const rows = data.items.map((entry) => [entry.timestamp, entry.actor.name, entry.event_type, entry.message, entry.branch?.name ?? 'Institute-wide', String(entry.metadata.status ?? '')])
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'campusone-audit-log.csv'; anchor.click(); URL.revokeObjectURL(url)
    await adminRequest(accessToken, 'audit-log/export', { method: 'POST', body: JSON.stringify({ count: data.items.length }) }).catch(() => undefined)
    setRevision((value) => value + 1)
  }

  const pageLabel = useMemo(() => data.count ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, data.count)} of ${data.count}` : '0 records', [data.count, page])
  return <main className="audit-log-page"><header className="audit-log-hero"><div><span className="audit-log-eyebrow">Governance / Institute-wide</span><h1>Audit Log</h1><p>Every write action performed through the institute application is recorded here with its actor, route, branch scope, status, and trace reference.</p></div><div className="audit-log-hero__status"><ShieldCheck /><strong>Protected</strong><small>Institute Admin only</small></div></header><div className="audit-log-notice"><FileSearch /><span><strong>Tenant-scoped record</strong><small>This log contains only actions belonging to the active institute.</small></span></div><section className="audit-log-card"><div className="audit-log-toolbar"><label className="audit-log-search"><Search /><span className="sr-only">Search audit events</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search actions, users, routes…" /></label><div className="audit-log-toolbar__actions"><button className="button-secondary" type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1) }}><RefreshCw /> Refresh</button><button className="button-primary" type="button" onClick={() => void exportCsv()} disabled={!data.items.length}><Download /> Export CSV</button></div></div>{error && <div className="audit-log-error" role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1) }}>Retry</button></div>}<div className="audit-log-table-wrap"><table className="audit-log-table"><caption className="sr-only">Institute audit events</caption><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Message</th><th>Scope</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="audit-log-empty">Loading audit events…</td></tr> : data.items.length === 0 ? <tr><td colSpan={7} className="audit-log-empty">No audit events match this search.</td></tr> : data.items.map((entry) => <><tr key={entry.id}><td>{dateTime(entry.timestamp)}</td><td><strong>{entry.actor.name}</strong></td><td><code>{entry.event_type}</code></td><td>{entry.message}</td><td>{entry.branch?.name ?? 'Institute-wide'}</td><td><span className={`audit-log-status audit-log-status--${Number(entry.metadata.status ?? 200) >= 400 ? 'error' : 'success'}`}>{String(entry.metadata.status ?? 'Recorded')}</span></td><td><button className="audit-log-expand" type="button" aria-expanded={expanded === entry.id} aria-label={`${expanded === entry.id ? 'Hide' : 'Show'} details for ${entry.event_type}`} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>+</button></td></tr>{expanded === entry.id && <tr key={`${entry.id}-details`}><td colSpan={7}><pre className="audit-log-details">{JSON.stringify(entry.metadata, null, 2)}</pre></td></tr>}</>)}</tbody></table></div><footer className="audit-log-footer"><span>{pageLabel}</span><div><button className="button-secondary" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="button-secondary" type="button" disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer></section></main>
}
