import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { PageHeader } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'

type Branch = { id: string; name: string }
type FinanceRecord = { id: string; kind: string; title: string; category: string; amount: string; entryDate: string; status: string; metadata?: Record<string, unknown>; branchId: string }
export type FinanceModule = 'expenses' | 'payroll' | 'budget' | 'reports'
const config: Record<FinanceModule, { title: string; description: string; kind?: string; tabs?: string[] }> = {
  expenses: { title: 'Expenses', description: 'Track, categorise, and approve institutional expenses.', kind: 'EXPENSE' },
  payroll: { title: 'Payroll', description: 'Manage payroll runs and salary disbursement records.', kind: 'PAYROLL' },
  budget: { title: 'Budget', description: 'Plan allocations and compare budget against actual finance records.', kind: 'BUDGET' },
  reports: { title: 'Finance Reports', description: 'Review collection, receivables, GST, and profit-and-loss summaries.', tabs: ['Daily Collection', 'Receivables', 'GST', 'P&L'] },
}
const money = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN')}`

export function FinanceModulePage({ accessToken, selectedBranch, branches, module, embedded = false }: { accessToken: string; selectedBranch: string; branches: Branch[]; module: FinanceModule; embedded?: boolean }) {
  const [records, setRecords] = useState<FinanceRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState(config[module].tabs?.[0] ?? '')
  const branchId = selectedBranch === 'all' ? branches[0]?.id ?? '' : selectedBranch
  const moduleConfig = config[module]

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ page: '1', pageSize: '100' })
    if (moduleConfig.kind) query.set('kind', moduleConfig.kind)
    if (selectedBranch !== 'all') query.set('branchId', selectedBranch)
    void adminRequest<PageData<FinanceRecord>>(accessToken, `finance/records?${query}`, { signal: controller.signal })
      .then((response) => { setRecords(response.items); setError(''); setLoaded(true) })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : `${moduleConfig.title} could not be loaded.`); setLoaded(true) } })
    return () => controller.abort()
  }, [accessToken, moduleConfig.kind, moduleConfig.title, revision, selectedBranch])

  const total = useMemo(() => records.reduce((sum, record) => sum + Number(record.amount || 0), 0), [records])
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    try {
      await adminRequest(accessToken, 'finance/records', { method: 'POST', body: JSON.stringify({ branchId, kind: moduleConfig.kind, title: form.get('title'), category: form.get('category'), amount: form.get('amount'), entryDate: form.get('entryDate'), status: form.get('status') || 'Draft', metadata: { notes: form.get('notes') } }) })
      setShowForm(false); setRevision((value) => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Finance record could not be saved.') }
  }

  return <div className="entity-page finance-page">{!embedded && <PageHeader title={moduleConfig.title} breadcrumbs={[{ label: 'Finance' }, { label: moduleConfig.title }]} description={moduleConfig.description} actions={<div className="page-actions"><button className="button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" />Refresh</button>{module !== 'reports' && <button className="button-primary" type="button" onClick={() => setShowForm(true)}><Plus aria-hidden="true" />Add {module === 'expenses' ? 'expense' : module === 'payroll' ? 'payroll run' : 'budget line'}</button>}</div>} />}
    {moduleConfig.tabs && <Card className="finance-tabs"><div role="tablist" aria-label="Finance report sections">{moduleConfig.tabs.map((item) => <button key={item} className={tab === item ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div></Card>}
    <section className="entity-grid finance-kpis"><Card><span className="micro-label">Records</span><strong>{records.length}</strong><small>Active branch</small></Card><Card><span className="micro-label">Total amount</span><strong>{money(total)}</strong><small>{module === 'budget' ? 'Allocated lines' : 'Recorded this period'}</small></Card><Card><span className="micro-label">Pending review</span><strong>{records.filter((record) => record.status !== 'Approved' && record.status !== 'Paid').length}</strong><small>Needs attention</small></Card></section>
    {showForm && module !== 'reports' && <Card><SectionHeader title={`Add ${module === 'expenses' ? 'expense' : module === 'payroll' ? 'payroll run' : 'budget line'}`} /><form className="entity-form finance-form" onSubmit={save}><label>Title<input name="title" required placeholder={module === 'expenses' ? 'Electricity bill' : module === 'payroll' ? 'August payroll' : 'Academic supplies'} /></label><label>Category<input name="category" placeholder="Operations" /></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required /></label><label>Date<input name="entryDate" type="date" required /></label><label>Status<select name="status"><option>Draft</option><option>Pending</option><option>Approved</option><option>Paid</option></select></label><label>Notes<textarea name="notes" rows={3} /></label><div className="form-actions"><button className="button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button-primary">Save record</button></div></form></Card>}
    <Card className="entity-table-card"><SectionHeader title={module === 'reports' ? tab : `${moduleConfig.title} ledger`} /><div className="table-scroll"><table className="data-table"><thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.title}</strong></td><td>{record.category || '—'}</td><td>{money(record.amount)}</td><td>{record.entryDate}</td><td>{record.status}</td></tr>)}</tbody></table>{!records.length && loaded && <div className="empty-state"><h3>No {moduleConfig.title.toLowerCase()} records</h3><p>Create the first record for this branch using the action above.</p></div>}{error && <div className="inline-error" role="alert">{error}</div>}</div></Card>
  </div>
}
