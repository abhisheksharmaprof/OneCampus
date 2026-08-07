import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Download, Plus, RefreshCw } from 'lucide-react'
import { BoneScreen, PageHeader, Tabs, type TabItem } from '../../components/admin-ui'
import { Card } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'

type Branch = { id: string; name: string }
type FinanceRecord = { id: string; title: string; recordType: string; status: string; data?: Record<string, unknown>; version: number; updatedAt?: string }
type ScreenResponse = { screen: { primaryAction?: string }; records: PageData<FinanceRecord> }

const money = (value: unknown) => value ? `₹${Number(value).toLocaleString('en-IN')}` : '—'

export function FeeStructurePage({ accessToken, branches, selectedBranch }: { accessToken: string; branches: Branch[]; selectedBranch: string }) {
  const [tab, setTab] = useState<'components' | 'discounts' | 'installments'>('components')
  const [data, setData] = useState<ScreenResponse | null>(null)
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const branchId = selectedBranch === 'all' ? branches[0]?.id ?? '' : selectedBranch

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: '1', pageSize: '100' })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    if (search.trim()) params.set('search', search.trim())
    setLoading(true)
    void adminRequest<ScreenResponse>(accessToken, `screens/FN1?${params}`, { signal: controller.signal })
      .then((response) => { setData(response); setError('') })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Fee structure could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, revision, search, selectedBranch])

  const records = data?.records.items ?? []
  const tabRecords = useMemo(() => records.filter((record) => {
    if (tab === 'components') return ['One-time', 'Recurring', 'fee-component'].includes(record.recordType) || !['Discount', 'Scholarship', 'discount-rule', 'Installment', 'installment-plan'].includes(record.recordType)
    if (tab === 'discounts') return ['Discount', 'Scholarship', 'discount-rule'].includes(record.recordType)
    return ['Installment', 'installment-plan'].includes(record.recordType)
  }), [records, tab])

  const createRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true); setActionError('')
    const name = String(form.get('name') ?? '').trim()
    const recordType = tab === 'components' ? String(form.get('type') || 'Recurring') : tab === 'discounts' ? 'Discount' : 'Installment'
    const dataPayload = tab === 'components'
      ? { type: form.get('type'), frequency: form.get('frequency'), baseAmount: form.get('baseAmount') }
      : tab === 'discounts'
        ? { type: form.get('discountType'), value: form.get('discountValue'), eligibilityRule: form.get('eligibilityRule') }
        : { installmentCount: form.get('installmentCount'), applicableFeeHeads: form.get('applicableFeeHeads'), firstDueDate: form.get('firstDueDate') }
    try {
      await adminRequest(accessToken, 'screens/FN1/records', { method: 'POST', body: JSON.stringify({ branchId, recordType, title: name, status: 'Active', data: dataPayload }) })
      setShowForm(false); setRevision((value) => value + 1)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Fee structure record could not be saved.') }
    finally { setSaving(false) }
  }

  const columns = tab === 'components' ? ['Name', 'Type', 'Frequency', 'Amount', 'Status'] : tab === 'discounts' ? ['Name', 'Type', 'Value', 'Eligibility', 'Status'] : ['Name', 'Installments', 'Fee heads', 'First due date', 'Status']

  return <BoneScreen name="fee-structure-page" loading={loading} label="Loading fee structure" fallback={<div className="entity-page finance-page"><p className="empty-copy">Loading fee structure…</p></div>}><div className="entity-page finance-page">
    <PageHeader title="Fee Structure" breadcrumbs={[{ label: 'Fees' }, { label: 'Structure' }]} description="Configure fee heads, discounts, and installment plans for the active branch." actions={<div className="page-actions"><button className="button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" />Refresh</button><button className="button-secondary" type="button" onClick={() => window.print()}><Download aria-hidden="true" />Export</button><button className="button-primary" type="button" onClick={() => { setActionError(''); setShowForm(true) }}><Plus aria-hidden="true" />Add {tab === 'components' ? 'fee component' : tab === 'discounts' ? 'discount rule' : 'installment plan'}</button></div>} />
    {actionError && <div className="inline-error" role="alert">{actionError}</div>}
    <section className="entity-grid finance-kpis"><Card><span className="micro-label">Configured records</span><strong>{records.length}</strong><small>Active branch</small></Card><Card><span className="micro-label">Active fee heads</span><strong>{records.filter((record) => record.status === 'Active').length}</strong><small>Available for invoices</small></Card><Card><span className="micro-label">Needs review</span><strong>{records.filter((record) => record.status !== 'Active').length}</strong><small>Inactive or draft</small></Card></section>
    <Card className="finance-tabs"><Tabs label="Fee structure sections" activeId={tab} onChange={(id) => setTab(id as typeof tab)} tabs={(['components', 'discounts', 'installments'] as const).map((id) => ({ id, label: id === 'components' ? 'Templates' : id === 'discounts' ? 'Scholarships' : 'Concessions', panel: null })) as TabItem[]} /></Card>
    {showForm && <Card><div className="section-header"><div><h2>Add {tab === 'components' ? 'fee component' : tab === 'discounts' ? 'discount rule' : 'installment plan'}</h2><p className="section-caption">Saved to the active institute and branch through the Fee Structure API.</p></div></div><form className="entity-form finance-form" onSubmit={createRecord}>{tab === 'components' && <><label>Name<input name="name" required placeholder="Tuition fee" /></label><label>Type<select name="type"><option value="Recurring">Recurring</option><option value="One-time">One-time</option></select></label><label>Frequency<select name="frequency"><option>Annual</option><option>Term-wise</option><option>Quarterly</option><option>Monthly</option></select></label><label>Base amount<input name="baseAmount" type="number" min="0" step="0.01" required /></label></>}{tab === 'discounts' && <><label>Name<input name="name" required placeholder="Sibling discount" /></label><label>Type<select name="discountType"><option>Percentage</option><option>Fixed amount</option></select></label><label>Value<input name="discountValue" type="number" min="0" step="0.01" required /></label><label>Eligibility rule<input name="eligibilityRule" required placeholder="Two or more enrolled siblings" /></label></>}{tab === 'installments' && <><label>Name<input name="name" required placeholder="Quarterly tuition" /></label><label>Number of installments<input name="installmentCount" type="number" min="1" required /></label><label>Applicable fee heads<input name="applicableFeeHeads" required placeholder="Tuition, lab" /></label><label>First due date<input name="firstDueDate" type="date" required /></label></>}<div className="form-actions"><button className="button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</button></div></form></Card>}
    <Card className="entity-table-card"><div className="section-header"><h2>{tab === 'components' ? 'Fee components' : tab === 'discounts' ? 'Discount rules' : 'Installment plans'} ({tabRecords.length})</h2><label className="search-control"><span className="sr-only">Search fee structure</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" /></label></div>{error ? <div className="inline-error" role="alert">{error}</div> : <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>{tabRecords.map((record) => { const value = record.data ?? {}; const cells = tab === 'components' ? [record.title, String(value.type ?? record.recordType), String(value.frequency ?? '—'), money(value.baseAmount), record.status] : tab === 'discounts' ? [record.title, String(value.type ?? '—'), String(value.value ?? '—'), String(value.eligibilityRule ?? '—'), record.status] : [record.title, String(value.installmentCount ?? '—'), String(value.applicableFeeHeads ?? '—'), String(value.firstDueDate ?? '—'), record.status]; return <tr key={record.id}>{cells.map((cell, index) => <td key={`${record.id}-${index}`}>{index === 0 ? <strong>{cell}</strong> : cell}</td>)}<td><button className="table-action" type="button" onClick={() => setActionError('Editing fee structure records is available from the record workflow.')}>Manage</button></td></tr> })}</tbody></table>{!tabRecords.length && !loading && <div className="empty-state"><h3>No records in this section</h3><p>Create the first record using the action above.</p></div>}{loading && <p className="empty-copy">Loading fee structure…</p>}</div>}</Card>
  </div></BoneScreen>
}
