import { useState } from 'react'
import { listDues, listGrades, type GradeOption } from '../finance.api'
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

  const dues = useAbortableLoad(
    (signal) => listDues(
      accessToken,
      { page, branchId, classId: classFilter, minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined },
      signal,
    ),
    [accessToken, branchId, page, classFilter, minDaysOverdue],
  )
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])

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
        <button type="button" className="fin-btn" onClick={() => window.print()}>Print list</button>
      </div>
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
