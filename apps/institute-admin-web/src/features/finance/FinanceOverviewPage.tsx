import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BarChart3, CreditCard, FileText, RefreshCw, TrendingDown, WalletCards } from 'lucide-react'
import { adminRequest, type PageData } from '../admin/admin.api'
import './finance-overview.css'

type Props = { accessToken: string; selectedBranch: string; onNavigate: (label: string) => void }
type Invoice = { id: string; studentName: string; amount: string; due_date: string; totalPaid: string }
type FinanceRecord = { id: string; kind: string; title: string; category: string; amount: string; entryDate: string; status: string }
type Snapshot = { invoices: Invoice[]; records: FinanceRecord[] }
const empty: Snapshot = { invoices: [], records: [] }
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export function FinanceOverviewPage({ accessToken, selectedBranch, onNavigate }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch

  useEffect(() => {
    const controller = new AbortController()
    const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : ''
    void Promise.all([
      adminRequest<PageData<Invoice>>(accessToken, `fees/invoices?page=1&pageSize=100${branchQuery}`, { signal: controller.signal }),
      adminRequest<PageData<FinanceRecord>>(accessToken, `finance/records?page=1&pageSize=100${branchQuery}`, { signal: controller.signal }),
    ]).then(([invoices, records]) => { setSnapshot({ invoices: invoices.items, records: records.items }); setError('') })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Finance overview could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, branchId, revision])

  const totals = useMemo(() => {
    const invoiced = snapshot.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
    const collected = snapshot.invoices.reduce((sum, invoice) => sum + Number(invoice.totalPaid || 0), 0)
    const operatingSpend = snapshot.records.filter((record) => record.kind === 'EXPENSE' || record.kind === 'PAYROLL').reduce((sum, record) => sum + Number(record.amount || 0), 0)
    return { invoiced, collected, outstanding: Math.max(invoiced - collected, 0), operatingSpend }
  }, [snapshot])
  const recent = useMemo(() => [...snapshot.records].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 5), [snapshot.records])
  const metrics = [
    { label: 'Fees collected', value: money(totals.collected), detail: `${snapshot.invoices.length} invoices loaded`, icon: CreditCard, action: 'Fees & Collections' },
    { label: 'Outstanding fees', value: money(totals.outstanding), detail: 'Open invoice balance', icon: WalletCards, action: 'Fees & Collections' },
    { label: 'Operating spend', value: money(totals.operatingSpend), detail: 'Expenses + payroll', icon: TrendingDown, action: 'Operations & Reports' },
    { label: 'Finance records', value: snapshot.records.length, detail: 'Live branch ledger', icon: FileText, action: 'Operations & Reports' },
  ]

  return <main className="finance-overview">
    <header className="finance-overview__hero"><div><span className="finance-overview__eyebrow">Finance / Command centre</span><h1>Know what is collected, owed, and spent.</h1><p>A live financial picture for the selected branch, with direct paths into fees, operating records, and reports.</p></div><button type="button" className="finance-overview__refresh" onClick={() => { setLoading(true); setRevision((value) => value + 1) }} disabled={loading}><RefreshCw /> {loading ? 'Refreshing…' : 'Refresh data'}</button></header>
    {error && <div className="finance-overview__error" role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1) }}>Retry</button></div>}
    <section className="finance-overview__metrics" aria-label="Finance summary">{metrics.map(({ label, value, detail, icon: Icon, action }) => <button type="button" className="finance-overview__metric" key={label} onClick={() => onNavigate(action)}><span><Icon /></span><small>{label}</small><strong>{loading ? '…' : value}</strong><em>{detail}</em><ArrowRight /></button>)}</section>
    <section className="finance-overview__grid"><article className="finance-overview__card finance-overview__card--wide"><header><div><span className="finance-overview__eyebrow">Control the ledger</span><h2>Choose a finance workflow</h2></div><BarChart3 /></header><div className="finance-overview__actions"><Action title="Fees & Collections" detail="Fee plans, invoices, payments, and defaults" icon={CreditCard} onClick={() => onNavigate('Fees & Collections')} /><Action title="Operations & Reports" detail="Expenses, payroll, budgets, and analysis" icon={FileText} onClick={() => onNavigate('Operations & Reports')} /></div></article><article className="finance-overview__card"><header><div><span className="finance-overview__eyebrow">Ledger activity</span><h2>Recent operating records</h2></div><TrendingDown /></header>{loading ? <p className="finance-overview__empty">Loading records…</p> : recent.length === 0 ? <p className="finance-overview__empty">No operating finance records have been created yet.</p> : <div className="finance-overview__activity">{recent.map((record) => <div key={record.id}><span className={`finance-overview__dot finance-overview__dot--${record.kind.toLowerCase()}`} /><div><strong>{record.title}</strong><small>{record.kind.toLowerCase()} · {record.status} · {record.entryDate}</small></div><b>{money(Number(record.amount || 0))}</b></div>)}</div>}</article></section>
  </main>
}

function Action({ title, detail, icon: Icon, onClick }: { title: string; detail: string; icon: typeof CreditCard; onClick: () => void }) {
  return <button type="button" className="finance-overview__action" onClick={onClick}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ArrowRight /></button>
}
