import { useMemo, useState } from 'react'
import {
  bulkGenerateInvoices, fetchInstituteBranding, listFeePlans, listGrades, listInvoices,
  listTemplates, patchInvoice, recordPayment,
  type GradeOption, type Invoice, type FeePlan, type PaymentMethod, type TemplateRecord,
} from '../finance.api'
import { AdminApiError } from '../../admin/admin.api'
import { buildDocumentModel, openPrintWindow, renderDocumentHtml, resolveLayout } from '../invoiceRender'
import InvoiceEditor from './InvoiceEditor'
import { money, Pagination, StatePanel, StatusBadge, useAbortableLoad, type FinanceSectionProps } from './shared'

const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'OTHER']

type Props = FinanceSectionProps & { branches: { id: string; name: string }[] }

export default function InvoicesSection({ accessToken, branchId }: Props) {
  const [mode, setMode] = useState<'list' | 'editor'>('list')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [search, setSearch] = useState('')
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [payFor, setPayFor] = useState<Invoice | null>(null)

  const invoices = useAbortableLoad(
    (signal) => listInvoices(accessToken, { page, branchId, status: statusFilter, classId: classFilter, search }, signal),
    [accessToken, branchId, page, statusFilter, classFilter, search, mode],
  )
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])
  const templates = useAbortableLoad((signal) => listTemplates(accessToken, undefined, signal), [accessToken])
  const branding = useAbortableLoad((signal) => fetchInstituteBranding(accessToken, signal), [accessToken])

  const templateFor = (invoice: Invoice): TemplateRecord | null => {
    const all = templates.data?.items ?? []
    return all.find((candidate) => candidate.id === invoice.templateId)
      ?? all.find((candidate) => candidate.kind === 'INVOICE' && candidate.isDefault)
      ?? null
  }

  const printInvoice = (invoice: Invoice) => {
    if (!branding.data) return
    const printed = openPrintWindow(
      renderDocumentHtml(buildDocumentModel({ invoice, branding: branding.data }), resolveLayout(templateFor(invoice)?.layout)),
    )
    if (!printed) setBusyMessage('The print popup was blocked by the browser.')
  }

  const cancelInvoice = (invoice: Invoice) => {
    if (!window.confirm(`Cancel invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return
    setBusyMessage(null)
    patchInvoice(accessToken, invoice.id, { status: 'CANCELLED' })
      .then(() => invoices.reload())
      .catch((cause: unknown) => setBusyMessage(cause instanceof AdminApiError ? (cause.fieldErrors.status?.[0] ?? cause.message) : 'Cancel failed.'))
  }

  if (mode === 'editor') {
    return <InvoiceEditor accessToken={accessToken} onClose={(created) => { setMode('list'); if (created) invoices.reload() }} />
  }

  const items = invoices.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <input value={search} placeholder="Search student, admission no or invoice no" onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
        </select>
        <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1) }}>
          <option value="">All classes</option>
          {(grades.data?.items ?? []).map((grade: GradeOption) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn" onClick={() => setBulkOpen(true)}>Bulk generate</button>
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => setMode('editor')}>New invoice</button>
      </div>
      {busyMessage && <p className="fin-field-error" role="alert">{busyMessage}</p>}
      <StatePanel loading={invoices.loading} error={invoices.error} onRetry={invoices.reload}
        empty={!items.length} emptyMessage="No invoices yet — create your first invoice.">
        <div className="fin-card">
          <table className="fin-table">
            <thead><tr>
              <th>Invoice</th><th>Student</th><th>Class</th><th className="is-right">Total</th>
              <th className="is-right">Paid</th><th>Status</th><th>Due date</th><th></th>
            </tr></thead>
            <tbody>
              {items.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.studentName}<br /><small>{invoice.admissionNumber}</small></td>
                  <td>{invoice.className || '—'}</td>
                  <td className="is-right">{money(invoice.total)}</td>
                  <td className="is-right">{money(invoice.totalPaid)}</td>
                  <td><StatusBadge status={invoice.status} /></td>
                  <td>{invoice.dueDate}</td>
                  <td>
                    {(invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID') && (
                      <>
                        <button type="button" className="fin-btn" onClick={() => printInvoice(invoice)}>Print</button>{' '}
                        <button type="button" className="fin-btn" onClick={() => setPayFor(invoice)}>Record payment</button>{' '}
                      </>
                    )}
                    {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && (
                      <button type="button" className="fin-btn fin-btn--danger" onClick={() => cancelInvoice(invoice)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={invoices.data?.page ?? 1} totalPages={invoices.data?.totalPages ?? 1} onPage={setPage} />
      </StatePanel>
      {bulkOpen && (
        <BulkGenerateModal
          accessToken={accessToken}
          grades={grades.data?.items ?? []}
          onClose={(generated) => { setBulkOpen(false); if (generated) invoices.reload() }}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          accessToken={accessToken}
          invoice={payFor}
          onClose={(recorded) => { setPayFor(null); if (recorded) invoices.reload() }}
        />
      )}
    </>
  )
}

function BulkGenerateModal({ accessToken, grades, onClose }: {
  accessToken: string
  grades: GradeOption[]
  onClose: (generated: boolean) => void
}) {
  const plans = useAbortableLoad((signal) => listFeePlans(accessToken, false, signal), [accessToken])
  const [planId, setPlanId] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10))
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const selectedPlan = useMemo(() => plans.data?.items.find((plan: FeePlan) => plan.id === planId), [plans.data, planId])

  const run = () => {
    if (!planId || !classIds.length) { setError('Pick a fee plan and at least one class.'); return }
    setRunning(true)
    setError(null)
    bulkGenerateInvoices(accessToken, { feePlanId: planId, classIds, issueDate, dueDate })
      .then((summary) => setResult(`Created ${summary.created} invoices, skipped ${summary.skipped} already-invoiced students.`))
      .catch((cause: unknown) => setError(cause instanceof AdminApiError ? cause.message : 'Bulk generation failed.'))
      .finally(() => setRunning(false))
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>Bulk generate invoices</h3>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        {result ? (
          <>
            <p>{result}</p>
            <div className="fin-modal__actions"><button type="button" className="fin-btn fin-btn--primary" onClick={() => onClose(true)}>Done</button></div>
          </>
        ) : (
          <>
            <div className="fin-form">
              <label className="is-wide">Fee plan
                <select value={planId} onChange={(event) => {
                  setPlanId(event.target.value)
                  const plan = plans.data?.items.find((candidate: FeePlan) => candidate.id === event.target.value)
                  if (plan?.appliesTo.length) setClassIds(plan.appliesTo)
                }}>
                  <option value="">— pick a plan —</option>
                  {(plans.data?.items ?? []).map((plan: FeePlan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
              </label>
              <label className="is-wide">Classes
                <select multiple size={6} value={classIds} onChange={(event) => setClassIds(Array.from(event.target.selectedOptions, (option) => option.value))}>
                  {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                </select>
              </label>
              <label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
              <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            </div>
            {selectedPlan && <p><small>{selectedPlan.items.map((item) => `${item.head}: ${money(item.amount)}`).join(' · ')}</small></p>}
            <div className="fin-modal__actions">
              <button type="button" className="fin-btn" disabled={running} onClick={() => onClose(false)}>Cancel</button>
              <button type="button" className="fin-btn fin-btn--primary" disabled={running} onClick={run}>{running ? 'Generating…' : 'Generate'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function RecordPaymentModal({ accessToken, invoice, onClose }: {
  accessToken: string
  invoice: Invoice
  onClose: (recorded: boolean) => void
}) {
  const outstanding = Math.max(Number(invoice.total) - Number(invoice.totalPaid), 0)
  const [amount, setAmount] = useState(outstanding.toFixed(2))
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = () => {
    setSaving(true)
    setError(null)
    recordPayment(accessToken, { invoiceId: invoice.id, amount: Number(amount || 0).toFixed(2), method, reference, remarks })
      .then(() => onClose(true))
      .catch((cause: unknown) => {
        setError(cause instanceof AdminApiError ? (cause.fieldErrors.amount?.[0] ?? cause.message) : 'Payment failed.')
        setSaving(false)
      })
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>Record payment — {invoice.invoiceNumber}</h3>
        <p>{invoice.studentName} · outstanding {money(outstanding)}</p>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        <div className="fin-form">
          <label>Amount<input type="number" min={0.01} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label>Method
            <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {METHODS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>Reference<input value={reference} placeholder="Txn id / cheque no" onChange={(event) => setReference(event.target.value)} /></label>
          <label>Remarks<input value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
        </div>
        <div className="fin-modal__actions">
          <button type="button" className="fin-btn" disabled={saving} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </div>
    </div>
  )
}
