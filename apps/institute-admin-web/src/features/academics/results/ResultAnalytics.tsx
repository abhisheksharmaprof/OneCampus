import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { safeSpreadsheetValue, type ExamDetail } from './results.api'

export function ResultAnalytics({
  detail,
  onReport,
}: {
  detail: ExamDetail
  onReport: (id: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const candidateIndex = useMemo(
    () => new Map(detail.candidates.map((c) => [c.id, c])),
    [detail.candidates],
  )
  const complete = detail.results.filter((r) => !r.missing && r.percentage !== null)
  const passed = complete.filter((r) => r.result === 'Pass')
  const avg = complete.length
    ? complete.reduce((sum, r) => sum + Number(r.percentage), 0) / complete.length
    : 0
  const topper = [...complete].sort((a, b) => Number(b.percentage) - Number(a.percentage))[0]
  const shown = detail.results
    .filter((r) => {
      const c = candidateIndex.get(r.candidateId)
      return (
        `${c?.name} ${c?.roll}`.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'top' && (r.rank?.position ?? Infinity) <= 3) ||
          (filter === 'passed' && r.result === 'Pass') ||
          (filter === 'failed' && ['Compartment', 'Needs improvement'].includes(r.result)) ||
          (filter === 'incomplete' && r.missing > 0))
      )
    })
    .sort((a, b) => (a.rank?.position ?? Infinity) - (b.rank?.position ?? Infinity))
  const exportRows = () =>
    shown.map((r) => {
      const c = candidateIndex.get(r.candidateId)
      return {
        Rank: r.rank?.display || '',
        Roll: c?.roll,
        Student: c?.name,
        Admission: c?.admission,
        Total: r.total,
        Maximum: r.maximum,
        Percentage: r.percentage,
        GPA: r.gpa,
        Credits: r.credits,
        Grade: r.grade,
        Division: r.division,
        Result: r.result,
        Grace: r.grace,
        Remarks: r.remark,
        ...Object.fromEntries(
          r.rows.flatMap((s) => [
            [s.subject, s.score],
            [`${s.subject} grade`, s.grade],
            [`${s.subject} grade points`, s.gradePoint],
            [`${s.subject} credits`, s.credits],
          ]),
        ),
      }
    })
  const exportFile = (csv = false) => {
    const book = XLSX.utils.book_new()
    const rows = exportRows().map((row) =>
      csv
        ? Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              String(safeSpreadsheetValue(key)),
              safeSpreadsheetValue(value),
            ]),
          )
        : row,
    )
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Results')
    XLSX.writeFile(
      book,
      `${detail.exam.name.replace(/[^a-z0-9-]/gi, '_')}-results.${csv ? 'csv' : 'xlsx'}`,
      { bookType: csv ? 'csv' : 'xlsx' },
    )
  }
  const grades = Object.entries(
    complete.reduce<Record<string, number>>(
      (map, r) => ({ ...map, [r.grade]: (map[r.grade] || 0) + 1 }),
      {},
    ),
  )
  const stats = detail.subjects.map((s) => {
    const row = detail.results.flatMap((r) => r.rows).find((r) => r.subjectId === s.subjectId)
    return {
      id: s.id,
      name: s.name,
      average: Number(row?.classAverage || 0),
      highest: Number(row?.classHighest || 0),
      maximum: Number(row?.maximum || 1),
    }
  })
  return (
    <section className="mr-panel mr-analytics">
      <div className="mr-split">
        <div>
          <span className="mr-eyebrow">Class intelligence</span>
          <h2>Analytics & merit leaderboard</h2>
          <p className="mr-muted">
            Uses the entire exam roster and saved marks. Export filters do not alter class rank.
          </p>
        </div>
        <div className="mr-actions">
          <button className="button-secondary" onClick={() => exportFile(true)}>
            Export CSV
          </button>
          <button className="button-primary" onClick={() => exportFile()}>
            Export Excel
          </button>
        </div>
      </div>
      <div className="mr-analytics-kpis">
        {[
          ['Appeared', complete.length, `${detail.results.length - complete.length} incomplete`],
          [
            'Pass rate',
            `${complete.length ? ((passed.length / complete.length) * 100).toFixed(1) : '0'}%`,
            `${passed.length} passed / ${complete.length} complete`,
          ],
          [
            'Class average',
            `${avg.toFixed(2)}%`,
            `Mean GPA ${complete.length ? (complete.reduce((sum, r) => sum + Number(r.gpa || 0), 0) / complete.length).toFixed(2) : '—'}`,
          ],
          [
            'Highest percentage',
            topper ? `${topper.percentage}%` : '—',
            topper ? candidateIndex.get(topper.candidateId)?.name : 'No complete results',
          ],
          [
            'Distinctions',
            passed.filter((r) => r.division === 'Distinction').length,
            'Based on configured threshold',
          ],
        ].map(([label, value, note]) => (
          <article key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="mr-analytics-charts">
        <section>
          <h3>Subject average vs highest</h3>
          <p className="mr-muted">
            Saved scores with disclosed grace; incomplete subjects excluded.
          </p>
          {stats.map((s) => (
            <div className="mr-chart-row" key={s.id}>
              <strong>{s.name}</strong>
              <div className="mr-chart-track">
                <span
                  style={{
                    width: `${Math.min(100, (s.average / s.maximum) * 100)}%`,
                  }}
                />
                <i
                  style={{
                    left: `${Math.min(99, (s.highest / s.maximum) * 100)}%`,
                  }}
                />
              </div>
              <small>
                Avg {s.average.toFixed(2)} · Highest {s.highest}
              </small>
            </div>
          ))}
        </section>
        <section>
          <h3>Grade distribution</h3>
          {grades.map(([grade, count]) => (
            <div className="mr-chart-row" key={grade}>
              <strong>{grade}</strong>
              <div className="mr-chart-track">
                <span
                  style={{
                    width: `${(count / Math.max(1, complete.length)) * 100}%`,
                  }}
                />
              </div>
              <small>{count} students</small>
            </div>
          ))}
          {!grades.length && <p>Complete marks to see grade distribution.</p>}
        </section>
      </div>
      <div className="mr-fields">
        <label>
          Filter results
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All students</option>
            <option value="top">Top 3 rank positions</option>
            <option value="passed">Passed only</option>
            <option value="failed">Compartment / needs improvement</option>
            <option value="incomplete">Incomplete results</option>
          </select>
        </label>
        <label>
          Search students
          <input
            placeholder="Name or roll number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="mr-table-wrap">
        <table>
          <thead>
            <tr>
              {[
                'Rank',
                'Roll',
                'Student',
                'Total',
                'Percentage',
                'GPA',
                'Grade',
                'Division',
                'Result',
                'Marksheet',
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const c = candidateIndex.get(r.candidateId)
              return (
                <tr key={r.candidateId}>
                  <td>{r.rank?.display || '—'}</td>
                  <td>{c?.roll}</td>
                  <th scope="row">{c?.name}</th>
                  <td>
                    {r.total} / {r.maximum}
                  </td>
                  <td>{r.percentage ?? '—'}%</td>
                  <td>{r.gpa ?? '—'}</td>
                  <td>{r.grade}</td>
                  <td>{r.division}</td>
                  <td>
                    <span className={`mr-badge ${r.result === 'Pass' ? 'approved' : ''}`}>
                      {r.result}
                    </span>
                    {r.formulaError && <small className="mr-field-error">{r.formulaError}</small>}
                  </td>
                  <td>
                    <button className="mr-link" onClick={() => c && onReport(c.enrollmentId)}>
                      Prepare marksheet
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="mr-empty">No students match these filters.</p>}
    </section>
  )
}
