import { useState } from 'react'
import { listDues, listGrades, logDuesExport, type DueRow, type GradeOption } from '../finance.api'
import { escapeHtml, openPrintWindow } from '../invoiceRender'
import { money, Pagination, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

const OVERDUE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any days overdue' },
  { value: '7', label: '7+ days' },
  { value: '30', label: '30+ days' },
  { value: '60', label: '60+ days' },
]

export default function DuesSection({ accessToken, branchId }: FinanceSectionProps) {
  const [page, setPage] = useState(1)
  const [classFilter, setClassFilter] = useState('')
  const [minDaysOverdue, setMinDaysOverdue] = useState('')
  const [printing, setPrinting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const dues = useAbortableLoad(
    (signal) => listDues(
      accessToken,
      { page, branchId, classId: classFilter, minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined },
      signal,
    ),
    [accessToken, branchId, page, classFilter, minDaysOverdue],
  )
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])

  const printDuesList = async () => {
    setPrinting(true)
    setNotice(null)
    try {
      void logDuesExport(accessToken, {
        branchId,
        classId: classFilter || undefined,
        minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined,
      }).catch(() => {})

      const rows: DueRow[] = []
      let fetchPage = 1
      let totalPages = 1
      do {
        const result = await listDues(accessToken, {
          page: fetchPage,
          branchId,
          classId: classFilter || undefined,
          minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined,
        })
        rows.push(...result.items)
        totalPages = result.totalPages
        fetchPage += 1
      } while (fetchPage <= totalPages)

      const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Dues report</title><style>
        body{font-family:Inter,sans-serif;padding:24px;color:#1d2939}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{padding:8px 10px;border-bottom:1px solid #e4e7ec;text-align:left}
        th{background:#f8fafc}
        td.num,th.num{text-align:right}
        h1{font-size:18px}
      </style></head><body>
        <h1>Outstanding dues</h1>
        <table><thead><tr><th>Student</th><th>Admission no</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Outstanding</th><th class="num">Days overdue</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.studentName)}</td><td>${escapeHtml(row.admissionNumber)}</td><td class="num">${money(row.billed)}</td><td class="num">${money(row.paid)}</td><td class="num">${money(row.outstanding)}</td><td class="num">${row.daysOverdue || '—'}</td></tr>`).join('')}</tbody></table>
      </body></html>`

      if (!openPrintWindow(html)) setNotice('The print popup was blocked by the browser.')
    } catch {
      setNotice('Could not build the dues report.')
    } finally {
      setPrinting(false)
    }
  }

  const items = dues.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1) }}>
          <option value="">All classes</option>
          {(grades.data?.items ?? []).map((grade: GradeOption) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
        </select>
        <select value={minDaysOverdue} onChange={(event) => { setMinDaysOverdue(event.target.value); setPage(1) }}>
          {OVERDUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn" disabled={printing} onClick={() => void printDuesList()}>
          {printing ? 'Preparing…' : 'Print list'}
        </button>
      </div>
      {notice && <p className="fin-field-error" role="alert">{notice}</p>}
      <StatePanel loading={dues.loading} error={dues.error} onRetry={dues.reload}
        empty={!items.length} emptyMessage="No outstanding dues — everyone is paid up.">
        <div className="fin-card">
          <table className="fin-table">
            <thead><tr>
              <th>Student</th><th>Admission no</th><th className="is-right">Billed</th>
              <th className="is-right">Paid</th><th className="is-right">Outstanding</th><th className="is-right">Days overdue</th>
            </tr></thead>
            <tbody>
              {items.map((due) => (
                <tr key={due.studentId}>
                  <td>{due.studentName}</td>
                  <td>{due.admissionNumber}</td>
                  <td className="is-right">{money(due.billed)}</td>
                  <td className="is-right">{money(due.paid)}</td>
                  <td className="is-right">{money(due.outstanding)}</td>
                  <td className="is-right">{due.daysOverdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={dues.data?.page ?? 1} totalPages={dues.data?.totalPages ?? 1} onPage={setPage} />
      </StatePanel>
    </>
  )
}
