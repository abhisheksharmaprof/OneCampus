import { useEffect, useState } from 'react'
import {
  fetchInstituteBranding, getInvoice, listInvoices, listPayments, listTemplates, searchStudents,
  type Invoice, type Payment, type PaymentMethod, type StudentOption,
} from '../finance.api'
import { buildDocumentModel, openPrintWindow, renderDocumentHtml, resolveLayout } from '../invoiceRender'
import { RecordPaymentModal } from './InvoicesSection'
import { money, Pagination, StatePanel, useAbortableLoad, useModalKeyHandling, type FinanceSectionProps } from './shared'

const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'OTHER']

function studentLabel(student: StudentOption): string {
  return [student.firstName, student.lastName].filter(Boolean).join(' ')
}

export default function PaymentsSection({ accessToken, branchId }: FinanceSectionProps) {
  const [page, setPage] = useState(1)
  const [method, setMethod] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set())

  const payments = useAbortableLoad(
    (signal) => listPayments(accessToken, { page, branchId, method, search, dateFrom, dateTo }, signal),
    [accessToken, branchId, page, method, search, dateFrom, dateTo],
  )
  const templates = useAbortableLoad((signal) => listTemplates(accessToken, 'RECEIPT', signal), [accessToken])
  const branding = useAbortableLoad((signal) => fetchInstituteBranding(accessToken, signal), [accessToken])

  const printReceipt = async (payment: Payment) => {
    if (!branding.data || printingIds.has(payment.id)) return
    setPrintingIds((current) => new Set(current).add(payment.id))
    setNotice(null)
    try {
      // Receipt rendering needs the invoice's line items and student class.
      const invoice = await getInvoice(accessToken, payment.invoiceId)
      const receiptTemplate = templates.data?.items.find((candidate) => candidate.isDefault) ?? templates.data?.items[0]
      const printed = openPrintWindow(
        renderDocumentHtml(
          buildDocumentModel({ invoice, branding: branding.data, payment }),
          resolveLayout(receiptTemplate?.layout),
        ),
      )
      if (!printed) setNotice('The print popup was blocked by the browser.')
    } catch {
      setNotice('Could not load the invoice for this receipt.')
    } finally {
      setPrintingIds((current) => {
        const next = new Set(current)
        next.delete(payment.id)
        return next
      })
    }
  }

  const items = payments.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <input value={search} placeholder="Search student or receipt no" onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        <select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1) }}>
          <option value="">All methods</option>
          {METHODS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} />
        <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} />
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => setPickerOpen(true)}>Record payment</button>
      </div>
      {notice && <p className="fin-field-error" role="alert">{notice}</p>}
      <StatePanel loading={payments.loading} error={payments.error} onRetry={payments.reload}
        empty={!items.length} emptyMessage="No payments recorded yet.">
        <div className="fin-card">
          <table className="fin-table">
            <thead><tr><th>Receipt</th><th>Student</th><th>Invoice</th><th className="is-right">Amount</th><th>Method</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {items.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.receiptNumber}</td>
                  <td>{payment.studentName}<br /><small>{payment.admissionNumber}</small></td>
                  <td>{payment.invoiceNumber}</td>
                  <td className="is-right">{money(payment.amount)}</td>
                  <td>{payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</td>
                  <td>{payment.paidAt.slice(0, 10)}</td>
                  <td>
                    <button type="button" className="fin-btn" disabled={printingIds.has(payment.id)} onClick={() => void printReceipt(payment)}>
                      {printingIds.has(payment.id) ? 'Preparing…' : 'Print receipt'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={payments.data?.page ?? 1} totalPages={payments.data?.totalPages ?? 1} onPage={setPage} />
      </StatePanel>
      {pickerOpen && (
        <InvoicePickerModal
          accessToken={accessToken}
          onPick={(invoice) => { setPickerOpen(false); setPayFor(invoice) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          accessToken={accessToken}
          invoice={payFor}
          onClose={(recorded) => { setPayFor(null); if (recorded) payments.reload() }}
        />
      )}
    </>
  )
}

/** Record payment flow: pick a student, then one of their open (ISSUED / PARTIALLY_PAID) invoices. */
function InvoicePickerModal({ accessToken, onPick, onClose }: {
  accessToken: string
  onPick: (invoice: Invoice) => void
  onClose: () => void
}) {
  const [studentQuery, setStudentQuery] = useState('')
  const [options, setOptions] = useState<StudentOption[]>([])
  const [student, setStudent] = useState<StudentOption | null>(null)

  useModalKeyHandling(onClose)

  const openInvoices = useAbortableLoad(
    async (signal) => {
      if (!student) return []
      const [issued, partial] = await Promise.all([
        listInvoices(accessToken, { studentId: student.id, status: 'ISSUED' }, signal),
        listInvoices(accessToken, { studentId: student.id, status: 'PARTIALLY_PAID' }, signal),
      ])
      return [...issued.items, ...partial.items]
    },
    [accessToken, student],
  )

  useEffect(() => {
    if (studentQuery.trim().length < 2) { setOptions([]); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchStudents(accessToken, studentQuery.trim(), controller.signal)
        .then((pageData) => setOptions(pageData.items))
        .catch(() => { if (!controller.signal.aborted) setOptions([]) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [accessToken, studentQuery])

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>Record payment</h3>
        {!student ? (
          <>
            <input
              autoFocus
              value={studentQuery}
              placeholder="Search student by name or admission number"
              onChange={(event) => setStudentQuery(event.target.value)}
            />
            {options.map((option) => (
              <button key={option.id} type="button" className="fin-btn" onClick={() => { setStudent(option); setOptions([]) }}>
                {studentLabel(option)} · {option.admissionNumber}
              </button>
            ))}
          </>
        ) : (
          <StatePanel loading={openInvoices.loading} error={openInvoices.error} onRetry={openInvoices.reload}
            empty={!openInvoices.data?.length} emptyMessage="This student has no open invoices.">
            {(openInvoices.data ?? []).map((invoice) => (
              <button key={invoice.id} type="button" className="fin-btn" onClick={() => onPick(invoice)}>
                {invoice.invoiceNumber} · {money(invoice.total)} (paid {money(invoice.totalPaid)}) · due {invoice.dueDate}
              </button>
            ))}
          </StatePanel>
        )}
        <div className="fin-modal__actions">
          {student && <button type="button" className="fin-btn" onClick={() => setStudent(null)}>Back</button>}
          <button type="button" className="fin-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
