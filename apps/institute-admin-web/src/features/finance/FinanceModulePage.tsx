import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  BanknoteArrowDown, BarChart3, CalendarDays, CheckCircle2, FilePenLine,
  Plus, RefreshCw, Search, Trash2, TrendingUp, WalletCards,
} from 'lucide-react'
import { adminRequest, type PageData } from '../admin/admin.api'
import { fetchSummary, listDues, listInvoices, listPayments } from './finance.api'
import { money, StatePanel, StatusBadge, useAbortableLoad } from './sections/shared'

type Branch = { id: string; name: string }
type FinanceRecord = {
  id: string
  kind: string
  title: string
  category: string
  amount: string
  entryDate: string
  status: string
  metadata?: Record<string, unknown>
  branchId: string
}
export type FinanceModule = 'expenses' | 'payroll' | 'budget' | 'reports'

const config: Record<Exclude<FinanceModule, 'reports'>, {
  title: string
  kind: string
  singular: string
  totalLabel: string
  placeholder: string
}> = {
  expenses: { title: 'Expenses', kind: 'EXPENSE', singular: 'expense', totalLabel: 'Recorded spend', placeholder: 'Electricity bill' },
  payroll: { title: 'Payroll', kind: 'PAYROLL', singular: 'payroll run', totalLabel: 'Payroll value', placeholder: 'September payroll' },
  budget: { title: 'Budget', kind: 'BUDGET', singular: 'budget line', totalLabel: 'Allocated budget', placeholder: 'Academic supplies' },
}

const emptyForm = () => ({ title: '', category: '', amount: '', entryDate: new Date().toISOString().slice(0, 10), status: 'Draft', notes: '' })

export function FinanceModulePage({ accessToken, selectedBranch, branches, module, embedded = false }: {
  accessToken: string
  selectedBranch: string
  branches: Branch[]
  module: FinanceModule
  embedded?: boolean
}) {
  if (module === 'reports') {
    return <FinanceReports accessToken={accessToken} selectedBranch={selectedBranch} />
  }
  return (
    <FinanceLedger
      accessToken={accessToken}
      selectedBranch={selectedBranch}
      branches={branches}
      module={module}
      embedded={embedded}
    />
  )
}

function FinanceLedger({ accessToken, selectedBranch, branches, module }: {
  accessToken: string
  selectedBranch: string
  branches: Branch[]
  module: Exclude<FinanceModule, 'reports'>
  embedded: boolean
}) {
  const moduleConfig = config[module]
  const [records, setRecords] = useState<FinanceRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState<FinanceRecord | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const branchId = selectedBranch === 'all' ? branches[0]?.id ?? '' : selectedBranch

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ page: '1', pageSize: '100', kind: moduleConfig.kind })
    if (selectedBranch !== 'all') query.set('branchId', selectedBranch)
    if (search.trim()) query.set('search', search.trim())
    void adminRequest<PageData<FinanceRecord>>(accessToken, `finance/records?${query}`, { signal: controller.signal })
      .then((response) => { setRecords(response.items); setError(''); setLoaded(true) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : `${moduleConfig.title} could not be loaded.`)
          setLoaded(true)
        }
      })
    return () => controller.abort()
  }, [accessToken, moduleConfig.kind, moduleConfig.title, revision, search, selectedBranch])

  const visible = statusFilter ? records.filter((record) => record.status === statusFilter) : records
  const total = useMemo(() => visible.reduce((sum, record) => sum + Number(record.amount || 0), 0), [visible])
  const approved = visible.filter((record) => record.status === 'Approved' || record.status === 'Paid')
  const pending = visible.length - approved.length

  const openForm = (record: FinanceRecord | 'new') => {
    setEditing(record)
    setError('')
    setForm(record === 'new' ? emptyForm() : {
      title: record.title,
      category: record.category,
      amount: record.amount,
      entryDate: record.entryDate,
      status: record.status,
      notes: typeof record.metadata?.notes === 'string' ? record.metadata.notes : '',
    })
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!branchId) { setError('Select a branch before creating a finance record.'); return }
    setSaving(true)
    setError('')
    const body = {
      branchId,
      kind: moduleConfig.kind,
      title: form.title.trim(),
      category: form.category.trim(),
      amount: Number(form.amount || 0).toFixed(2),
      entryDate: form.entryDate,
      status: form.status,
      metadata: { notes: form.notes.trim() },
    }
    try {
      await adminRequest(accessToken, editing === 'new' ? 'finance/records' : `finance/records/${editing?.id}`, {
        method: editing === 'new' ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
      })
      setEditing(null)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Finance record could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (record: FinanceRecord) => {
    if (!window.confirm(`Delete “${record.title}”? This removes the record from the ${moduleConfig.title.toLowerCase()} ledger.`)) return
    setDeletingId(record.id)
    setError('')
    try {
      await adminRequest(accessToken, `finance/records/${record.id}`, { method: 'DELETE' })
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Finance record could not be deleted.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fin-module">
      <div className="fin-toolbar fin-toolbar--panel">
        <label className="fin-search"><Search size={16} aria-hidden /><input aria-label={`Search ${moduleConfig.title.toLowerCase()}`} value={search} placeholder={`Search ${moduleConfig.title.toLowerCase()}`} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option><option>Draft</option><option>Pending</option><option>Approved</option><option>Paid</option>
        </select>
        <span className="fin-toolbar__spacer" />
        <button className="fin-btn" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} aria-hidden /> Refresh</button>
        <button className="fin-btn fin-btn--primary" type="button" onClick={() => openForm('new')}><Plus size={16} aria-hidden /> Add {moduleConfig.singular}</button>
      </div>

      <section className="fin-kpis" aria-label={`${moduleConfig.title} summary`}>
        <div className="fin-kpi"><span className="fin-kpi__icon"><WalletCards size={18} /></span><span>{moduleConfig.totalLabel}</span><b>{money(total)}</b><small>{visible.length} ledger entries</small></div>
        <div className="fin-kpi"><span className="fin-kpi__icon fin-kpi__icon--success"><CheckCircle2 size={18} /></span><span>Approved or paid</span><b>{approved.length}</b><small>Ready for reporting</small></div>
        <div className="fin-kpi"><span className="fin-kpi__icon fin-kpi__icon--warning"><CalendarDays size={18} /></span><span>Pending review</span><b>{pending}</b><small>Needs attention</small></div>
      </section>

      {error && <p className="fin-field-error" role="alert">{error}</p>}
      <div className="fin-card fin-card--table">
        <div className="fin-card__header"><div><h3>{moduleConfig.title} ledger</h3><p>Branch-scoped operational records</p></div></div>
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead><tr><th>Record</th><th>Category</th><th className="is-right">Amount</th><th>Date</th><th>Status</th><th className="fin-table__actions">Actions</th></tr></thead>
            <tbody>{visible.map((record) => (
              <tr key={record.id}>
                <td><strong>{record.title}</strong>{typeof record.metadata?.notes === 'string' && record.metadata.notes ? <small>{record.metadata.notes}</small> : null}</td>
                <td>{record.category || 'Uncategorised'}</td>
                <td className="is-right"><strong>{money(record.amount)}</strong></td>
                <td>{record.entryDate}</td>
                <td><StatusBadge status={record.status} /></td>
                <td className="fin-table__actions"><button className="fin-icon-btn" type="button" aria-label={`Edit ${record.title}`} onClick={() => openForm(record)}><FilePenLine size={16} /></button><button className="fin-icon-btn fin-icon-btn--danger" type="button" aria-label={`Delete ${record.title}`} disabled={deletingId === record.id} onClick={() => void remove(record)}><Trash2 size={16} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          {!visible.length && loaded && <div className="fin-state fin-state--empty"><h3>No {moduleConfig.title.toLowerCase()} records</h3><p>Add the first record for this branch to begin tracking it.</p></div>}
        </div>
      </div>

      {editing && (
        <div className="fin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="finance-record-title">
          <form className="fin-modal" onSubmit={save}>
            <div className="fin-modal__header"><div><span className="fin-kpi__icon"><FilePenLine size={17} /></span><h3 id="finance-record-title">{editing === 'new' ? `Add ${moduleConfig.singular}` : `Edit ${moduleConfig.singular}`}</h3></div><button className="fin-icon-btn" type="button" aria-label="Close" onClick={() => setEditing(null)}>×</button></div>
            <div className="fin-form">
              <label className="is-wide">Title<input autoFocus required value={form.title} placeholder={moduleConfig.placeholder} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>Category<input value={form.category} placeholder="Operations" onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
              <label>Amount<input value={form.amount} type="number" min="0" step="0.01" required onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
              <label>Date<input value={form.entryDate} type="date" required onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></label>
              <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Draft</option><option>Pending</option><option>Approved</option><option>Paid</option></select></label>
              <label className="is-wide">Notes<textarea value={form.notes} rows={3} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <div className="fin-modal__actions"><button className="fin-btn" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="fin-btn fin-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}

const REPORT_TABS = ['Collections', 'Receivables', 'Tax summary', 'Income & expense'] as const
type ReportTab = typeof REPORT_TABS[number]

function FinanceReports({ accessToken, selectedBranch }: { accessToken: string; selectedBranch: string }) {
  const [tab, setTab] = useState<ReportTab>('Collections')
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch
  const summary = useAbortableLoad((signal) => fetchSummary(accessToken, branchId, signal), [accessToken, branchId])
  const invoices = useAbortableLoad((signal) => listInvoices(accessToken, { page: 1, pageSize: 100, branchId }, signal), [accessToken, branchId])
  const payments = useAbortableLoad((signal) => listPayments(accessToken, { page: 1, pageSize: 100, branchId }, signal), [accessToken, branchId])
  const dues = useAbortableLoad((signal) => listDues(accessToken, { page: 1, branchId }, signal), [accessToken, branchId])
  const expenses = useAbortableLoad((signal) => {
    const query = new URLSearchParams({ page: '1', pageSize: '100', kind: 'EXPENSE' })
    if (branchId) query.set('branchId', branchId)
    return adminRequest<PageData<FinanceRecord>>(accessToken, `finance/records?${query}`, { signal })
  }, [accessToken, branchId])
  const loading = summary.loading || invoices.loading || payments.loading || dues.loading || expenses.loading
  const error = summary.error ?? invoices.error ?? payments.error ?? dues.error ?? expenses.error
  const reload = () => { summary.reload(); invoices.reload(); payments.reload(); dues.reload(); expenses.reload() }
  const invoiceItems = invoices.data?.items ?? []
  const paymentItems = payments.data?.items ?? []
  const dueItems = dues.data?.items ?? []
  const expenseItems = expenses.data?.items ?? []
  const collected = paymentItems.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const tax = invoiceItems.reduce((sum, invoice) => sum + Number(invoice.taxAmount || 0), 0)
  const outstanding = dueItems.reduce((sum, due) => sum + Number(due.outstanding || 0), 0)
  const spend = expenseItems.reduce((sum, record) => sum + Number(record.amount || 0), 0)
  const maxMonth = Math.max(1, ...(summary.data?.monthlySeries ?? []).map((point) => Number(point.collected || 0)))

  return (
    <div className="fin-module">
      <div className="fin-report-tabs" role="tablist" aria-label="Finance report sections">{REPORT_TABS.map((item) => <button key={item} className={tab === item ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
      <StatePanel loading={loading} error={error} onRetry={reload}>
        <section className="fin-kpis" aria-label="Finance report summary">
          <div className="fin-kpi"><span className="fin-kpi__icon fin-kpi__icon--success"><TrendingUp size={18} /></span><span>Payments in view</span><b>{money(collected)}</b><small>{paymentItems.length} receipts</small></div>
          <div className="fin-kpi"><span className="fin-kpi__icon fin-kpi__icon--warning"><BanknoteArrowDown size={18} /></span><span>Outstanding in view</span><b>{money(outstanding)}</b><small>{dueItems.length} student accounts</small></div>
          <div className="fin-kpi"><span className="fin-kpi__icon"><BarChart3 size={18} /></span><span>Net cash view</span><b>{money(collected - spend)}</b><small>Payments minus recorded expenses</small></div>
        </section>

        {tab === 'Collections' && <ReportCard title="Monthly collections" subtitle="Actual payments recorded by month"><div className="fin-chart fin-chart--report">{(summary.data?.monthlySeries ?? []).map((point) => <div className="fin-chart__point" key={point.month}><div className="fin-chart__value">{money(point.collected)}</div><div className="bar" style={{ height: `${Math.max(3, Number(point.collected || 0) / maxMonth * 100)}%` }} /><span>{new Date(`${point.month}-01`).toLocaleDateString('en-IN', { month: 'short' })}</span></div>)}</div></ReportCard>}
        {tab === 'Receivables' && <ReportCard title="Receivables ageing" subtitle="Highest outstanding student balances"><div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>Student</th><th>Admission no</th><th className="is-right">Outstanding</th><th className="is-right">Days overdue</th></tr></thead><tbody>{dueItems.slice(0, 12).map((due) => <tr key={due.studentId}><td><strong>{due.studentName}</strong></td><td>{due.admissionNumber}</td><td className="is-right"><strong>{money(due.outstanding)}</strong></td><td className="is-right">{due.daysOverdue}</td></tr>)}</tbody></table></div></ReportCard>}
        {tab === 'Tax summary' && <ReportCard title="Tax summary" subtitle="Tax recorded across invoices in the current view"><div className="fin-report-total"><span>Taxable invoices</span><strong>{invoiceItems.filter((invoice) => Number(invoice.taxAmount) > 0).length}</strong><span>Tax recorded</span><strong>{money(tax)}</strong></div></ReportCard>}
        {tab === 'Income & expense' && <ReportCard title="Income & expense" subtitle="Operational cash comparison for the loaded period"><div className="fin-comparison"><div><span>Payment income</span><strong>{money(collected)}</strong></div><div><span>Recorded expenses</span><strong>{money(spend)}</strong></div><div className={collected - spend >= 0 ? 'is-positive' : 'is-negative'}><span>Net position</span><strong>{money(collected - spend)}</strong></div></div></ReportCard>}
      </StatePanel>
    </div>
  )
}

function ReportCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="fin-card"><div className="fin-card__header"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{children}</div>
}
