import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CreditCard, Plus, Search } from 'lucide-react'
import { DataTable, type DataTableColumn } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'

type Invoice = { id: string; studentId: string; studentName: string; amount: string; due_date: string; totalPaid: string }
type RefundRecord = { id: string; title: string; status: string; data?: Record<string, unknown> }
type ScreenRecords<T> = { screen: Record<string, unknown>; records: PageData<T> }
type Student = { id: string; firstName: string; lastName: string; admissionNumber: string }
const emptyPage = <T,>(): PageData<T> => ({ count: 0, page: 1, pageSize: 0, totalPages: 1, next: null, previous: null, items: [] })
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

export function FeeCollectionsPage({ accessToken, selectedBranch }: { accessToken: string; selectedBranch: string }) {
  const [data, setData] = useState<PageData<Invoice>>(emptyPage)
  const [students, setStudents] = useState<Student[]>([])
  const [studentScope, setStudentScope] = useState('')
  const [loadedQuery, setLoadedQuery] = useState('')
  const [listError, setListError] = useState('')
  const [actionError, setActionError] = useState('')
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [revision, setRevision] = useState(0)
  const [activeTab, setActiveTab] = useState<'online' | 'cash' | 'refunds' | 'defaults'>('online')
  const [refunds, setRefunds] = useState<RefundRecord[]>([])
  const queryKey = [accessToken, selectedBranch, page, pageSize, search.trim(), revision].join('|')
  const optionsScope = [accessToken, selectedBranch, revision].join('|')

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    if (search.trim()) params.set('search', search.trim())
    void adminRequest<PageData<Invoice>>(accessToken, `fees/invoices?${params}`, { signal: controller.signal })
      .then((response) => { setData(response); setListError(''); setLoadedQuery(queryKey) })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setListError(cause instanceof Error ? cause.message : 'Fee collections could not be loaded.'); setLoadedQuery(queryKey) } })
    return () => controller.abort()
  }, [accessToken, page, pageSize, queryKey, revision, search, selectedBranch])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: '1', pageSize: '100' })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    void adminRequest<PageData<Student>>(accessToken, `students?${params}`, { signal: controller.signal })
      .then((response) => { setStudents(response.items); setStudentScope(optionsScope) })
      .catch(() => { if (!controller.signal.aborted) { setStudents([]); setStudentScope(optionsScope) } })
    return () => controller.abort()
  }, [accessToken, optionsScope, revision, selectedBranch])

  useEffect(() => {
    if (activeTab !== 'refunds') return
    const controller = new AbortController()
    const params = new URLSearchParams({ page: '1', pageSize: '100' })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    void adminRequest<ScreenRecords<RefundRecord>>(accessToken, `screens/FN4?${params}`, { signal: controller.signal })
      .then((response) => setRefunds(response.records.items))
      .catch(() => { if (!controller.signal.aborted) setRefunds([]) })
    return () => controller.abort()
  }, [accessToken, activeTab, revision, selectedBranch])

  const queryLoaded = loadedQuery === queryKey
  const availableStudents = studentScope === optionsScope ? students : []
  const outstandingInvoices = (queryLoaded ? data.items : []).filter((invoice) => Number(invoice.amount) > Number(invoice.totalPaid))
  const totals = useMemo(() => (queryLoaded ? data.items : []).reduce((value, invoice) => {
    const amount = Number(invoice.amount); const paid = Number(invoice.totalPaid); const outstanding = amount - paid
    return { invoiced: value.invoiced + amount, collected: value.collected + paid, pending: value.pending + Math.max(outstanding, 0) }
  }, { invoiced: 0, collected: 0, pending: 0 }), [data.items, queryLoaded])

  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setActionError('')
    try { await adminRequest<Invoice>(accessToken, 'fees/invoices', { method: 'POST', body: JSON.stringify({ studentId: form.get('studentId'), amount: form.get('amount'), dueDate: form.get('dueDate') }) }); setShowInvoiceForm(false); setPage(1); setRevision((value) => value + 1) } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Invoice could not be created.') } finally { setSaving(false) }
  }
  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!paymentInvoice) return; const form = new FormData(event.currentTarget); setSaving(true); setActionError('')
    try { await adminRequest(accessToken, 'fees/payments', { method: 'POST', body: JSON.stringify({ invoiceId: paymentInvoice.id, amount: form.get('amount') }) }); setPaymentInvoice(null); setRevision((value) => value + 1) } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Payment could not be recorded.') } finally { setSaving(false) }
  }

  const columns: DataTableColumn<Invoice>[] = [
    { id: 'student', header: 'Student', cell: (invoice) => invoice.studentName },
    { id: 'amounts', header: 'Due / paid', cell: (invoice) => `${money.format(Number(invoice.amount))} / ${money.format(Number(invoice.totalPaid))}` },
    { id: 'dueDate', header: 'Due date', cell: (invoice) => invoice.due_date },
    { id: 'status', header: 'Status', cell: (invoice) => { const outstanding = Number(invoice.amount) - Number(invoice.totalPaid); return outstanding <= 0 ? 'PAID' : Number(invoice.totalPaid) > 0 ? 'PARTIAL' : 'PENDING' } },
    { id: 'actions', header: <span className="sr-only">Actions</span>, align: 'end', cell: (invoice) => Number(invoice.amount) - Number(invoice.totalPaid) > 0 ? <button className="button-secondary" type="button" onClick={() => setPaymentInvoice(invoice)}><CreditCard />Record payment</button> : null },
  ]

  return <div className="entity-page finance-page"><div className="page-heading"><div><p className="breadcrumb">Fees / Collections</p><h1>Fee Collections</h1><p className="page-subtitle">Monitor collection performance, invoices, outstanding balances, and payments.</p></div><div className="page-actions"><button type="button" className="button-secondary" onClick={() => setRevision((value) => value + 1)}>Refresh</button><button type="button" className="button-primary" onClick={() => { setActiveTab('cash'); setShowInvoiceForm(true) }}><Plus />Add Invoice</button></div></div>
    {actionError && <div className="inline-error" role="alert">{actionError}</div>}
    <section className="entity-grid finance-kpis"><Card><span className="micro-label">Invoiced</span><strong>{money.format(totals.invoiced)}</strong><small>Current result set</small></Card><Card><span className="micro-label">Collected</span><strong>{money.format(totals.collected)}</strong><small>Recorded payments</small></Card><Card><span className="micro-label">Outstanding</span><strong>{money.format(totals.pending)}</strong><small>{outstandingInvoices.length} open invoice{outstandingInvoices.length === 1 ? '' : 's'}</small></Card><Card><span className="micro-label">Collection rate</span><strong>{totals.invoiced ? `${Math.round(totals.collected / totals.invoiced * 100)}%` : '—'}</strong><small>Paid against invoiced</small></Card></section>
    <Card className="finance-tabs"><div role="tablist" aria-label="Fee collection sections"><button className={activeTab === 'online' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'online'} onClick={() => setActiveTab('online')}>Online</button><button className={activeTab === 'cash' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'cash'} onClick={() => setActiveTab('cash')}>Cash</button><button className={activeTab === 'refunds' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'refunds'} onClick={() => setActiveTab('refunds')}>Refunds</button><button className={activeTab === 'defaults' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'defaults'} onClick={() => setActiveTab('defaults')}>Defaults</button></div></Card>
    {showInvoiceForm && activeTab === 'cash' && <Card><SectionHeader title="Create fee invoice" /><form className="entity-form entity-form-inline" onSubmit={createInvoice}><label>Student<select name="studentId" required><option value="">Select a student</option>{availableStudents.map((student) => <option key={student.id} value={student.id}>{`${student.firstName} ${student.lastName}`.trim()} — {student.admissionNumber}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Due date<input name="dueDate" type="date" required /></label><div className="form-actions"><button className="button-secondary" type="button" onClick={() => setShowInvoiceForm(false)}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Create invoice'}</button></div></form></Card>}
    {paymentInvoice && <Card><SectionHeader title={`Record payment — ${paymentInvoice.studentName}`} /><form className="entity-form entity-form-inline" onSubmit={recordPayment}><label>Amount<input name="amount" type="number" min="0.01" max={Math.max(Number(paymentInvoice.amount) - Number(paymentInvoice.totalPaid), 0)} step="0.01" required /></label><p className="empty-copy">Outstanding: {money.format(Number(paymentInvoice.amount) - Number(paymentInvoice.totalPaid))}</p><div className="form-actions"><button className="button-secondary" type="button" onClick={() => setPaymentInvoice(null)}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</button></div></form></Card>}
    {activeTab === 'online' && <div className="finance-two-column"><Card><SectionHeader title="Collection health" /><div className="finance-summary-list"><div><span>Paid invoices</span><strong>{(queryLoaded ? data.items : []).filter((invoice) => Number(invoice.totalPaid) >= Number(invoice.amount)).length}</strong></div><div><span>Partially paid</span><strong>{(queryLoaded ? data.items : []).filter((invoice) => Number(invoice.totalPaid) > 0 && Number(invoice.totalPaid) < Number(invoice.amount)).length}</strong></div><div><span>Pending invoices</span><strong>{(queryLoaded ? data.items : []).filter((invoice) => Number(invoice.totalPaid) === 0).length}</strong></div></div></Card><Card><SectionHeader title="Recent collection records" /><div className="finance-recent-list">{(queryLoaded ? data.items : []).slice(0, 5).map((invoice) => <div key={invoice.id}><span>{invoice.studentName}</span><strong>{money.format(Number(invoice.totalPaid))}</strong>{Number(invoice.amount) > Number(invoice.totalPaid) && <button className="table-action" type="button" onClick={() => setPaymentInvoice(invoice)}>Record payment</button>}</div>)}{queryLoaded && !data.items.length && <p className="empty-copy">No collection records yet.</p>}</div></Card></div>}
    {activeTab === 'refunds' && <Card className="entity-table-card"><SectionHeader title={`Refund requests (${refunds.length})`} /><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Amount</th><th>Reason</th><th>Status</th></tr></thead><tbody>{refunds.map((refund) => <tr key={refund.id}><td><strong>{refund.title}</strong></td><td>{refund.data?.amount ? money.format(Number(refund.data.amount)) : '—'}</td><td>{String(refund.data?.reason ?? '—')}</td><td>{refund.status}</td></tr>)}</tbody></table>{!refunds.length && <div className="empty-state"><h3>No refund requests</h3><p>Refund requests will appear here when recorded through the Refunds API.</p></div>}</div></Card>}
    {activeTab === 'defaults' && <Card className="entity-table-card"><SectionHeader title={`Outstanding invoices (${outstandingInvoices.length})`} /><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Due date</th><th>Invoice</th><th>Paid</th><th>Outstanding</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{outstandingInvoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.studentName}</strong></td><td>{invoice.due_date}</td><td>{money.format(Number(invoice.amount))}</td><td>{money.format(Number(invoice.totalPaid))}</td><td><strong>{money.format(Number(invoice.amount) - Number(invoice.totalPaid))}</strong></td><td><button className="table-action" type="button" onClick={() => setPaymentInvoice(invoice)}>Record payment</button></td></tr>)}</tbody></table>{queryLoaded && !outstandingInvoices.length && <div className="empty-state"><h3>No outstanding invoices</h3><p>All invoices in this result set are fully paid.</p></div>}</div></Card>}
    {activeTab === 'cash' && <Card className="entity-table-card"><SectionHeader title={`Cash collection invoices (${queryLoaded ? data.count : 0})`} /><DataTable caption="Fee invoices" columns={columns} rows={queryLoaded ? data.items : []} getRowId={(invoice) => invoice.id} rowLabel={(invoice) => invoice.studentName} totalRows={queryLoaded ? data.count : 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} loading={!queryLoaded} error={queryLoaded && listError ? listError : undefined} onRetry={() => setRevision((value) => value + 1)} filters={<label className="search-control"><Search aria-hidden="true" /><span className="sr-only">Search fee invoices</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search fee invoices" /></label>} emptyTitle="No fee invoices found" emptyDescription={search ? 'Try a different search.' : 'No fee invoices exist in this tenant context.'} /></Card>}
  </div>
}
