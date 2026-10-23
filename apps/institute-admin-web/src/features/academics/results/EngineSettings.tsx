import { useState } from 'react'
import type { Rules, SubjectChoice } from './results.api'
import { resultsRequest, errorMessage } from './results.api'

const scales: Record<string, Rules['grades']> = {
  CBSE: [
    [91, 'A1', 10],
    [81, 'A2', 9],
    [71, 'B1', 8],
    [61, 'B2', 7],
    [51, 'C1', 6],
    [41, 'C2', 5],
    [33, 'D', 4],
    [0, 'E', 0],
  ].map(([minimum, label, points]) => ({
    minimum: Number(minimum),
    label: String(label),
    points: Number(points),
    remark: '',
  })),
  University: [
    [90, 'O', 10],
    [80, 'A+', 9],
    [70, 'A', 8],
    [60, 'B+', 7],
    [50, 'B', 6],
    [40, 'C', 5],
    [0, 'F', 0],
  ].map(([minimum, label, points]) => ({
    minimum: Number(minimum),
    label: String(label),
    points: Number(points),
    remark: '',
  })),
  US: [
    [97, 'A+', 10],
    [93, 'A', 10],
    [90, 'A-', 9.25],
    [87, 'B+', 8.25],
    [83, 'B', 7.5],
    [80, 'B-', 6.75],
    [70, 'C', 5],
    [60, 'D', 2.5],
    [0, 'F', 0],
  ].map(([minimum, label, points]) => ({
    minimum: Number(minimum),
    label: String(label),
    points: Number(points),
    remark: '',
  })),
}
export function EngineSettings({
  rules,
  onChange,
  subjects,
  token,
  examId,
}: {
  rules: Rules
  onChange: (r: Rules) => void
  subjects: SubjectChoice[]
  token: string
  examId?: string
}) {
  const [test, setTest] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof Rules, value: Rules[keyof Rules]) => {
    onChange({ ...rules, [key]: value })
    setTest('')
  }
  const choice = (
    label: string,
    key: keyof Rules,
    values: [string, string][],
    fallback: string,
  ) => (
    <label>
      {label}
      <select
        value={String(rules[key] ?? fallback)}
        onChange={(e) => set(key, key === 'decimals' ? Number(e.target.value) : e.target.value)}
      >
        {values.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
  const numeric = (label: string, key: keyof Rules, fallback: number, max = 100) => (
    <label>
      {label}
      <input
        type="number"
        min={['bestN', 'fixedCount'].includes(key) ? 1 : 0}
        max={max}
        step={['bestN', 'fixedCount', 'compartment'].includes(key) ? 1 : '.01'}
        value={Number(rules[key] ?? fallback)}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </label>
  )
  return (
    <section className="mr-engine">
      <div className="mr-section-heading">
        <span className="mr-eyebrow">Academic engine</span>
        <h3>Formulas, grades & ranking</h3>
        <p className="mr-muted">
          Rules are saved with this exam. Reopen approved sheets before changing them; previously
          issued PDFs remain unchanged.
        </p>
      </div>
      <fieldset>
        <legend>1 · Aggregate & subject credits</legend>
        <div className="mr-fields">
          {choice(
            'Aggregate rule',
            'aggregateMode',
            [
              ['all', 'All included subjects'],
              ['best_n', 'Best of N subjects'],
              ['fixed', 'Fixed subject count and maximum'],
              ['imported', 'Use explicitly imported total'],
            ],
            'all',
          )}
          {rules.aggregateMode === 'best_n' && numeric('Best subject count', 'bestN', 5, 60)}
          {rules.aggregateMode === 'fixed' && (
            <>
              {numeric('Fixed subject count', 'fixedCount', 5, 60)}
              {numeric('Fixed total maximum', 'fixedMaximum', 500, 60000000)}
            </>
          )}
        </div>
        {rules.aggregateMode === 'imported' && (
          <p className="mr-warning">
            Map the imported total column for every student. Missing totals block issuance; subject
            marks are retained and reviewed separately.
          </p>
        )}
        <div className="mr-table-scroll">
          <table className="mr-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Display name</th>
                <th>Code</th>
                <th>Credits</th>
                <th>In total</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => {
                const option = rules.subjects?.[subject.id] || {}
                const update = (patch: typeof option) =>
                  set('subjects', {
                    ...rules.subjects,
                    [subject.id]: { ...option, ...patch },
                  })
                return (
                  <tr key={subject.id}>
                    <th>{subject.name}</th>
                    <td>
                      <input
                        aria-label={`${subject.name} display name`}
                        maxLength={120}
                        value={option.name ?? ''}
                        placeholder={subject.name}
                        onChange={(e) => update({ name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${subject.name} code`}
                        maxLength={30}
                        value={option.code ?? ''}
                        onChange={(e) => update({ code: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${subject.name} credits`}
                        type="number"
                        min="0"
                        max="100"
                        step=".01"
                        value={option.credits ?? 1}
                        onChange={(e) => update({ credits: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Include ${subject.name} in total`}
                        type="checkbox"
                        checked={option.include ?? true}
                        onChange={(e) => update({ include: e.target.checked })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
      <fieldset>
        <legend>2 · Percentage & GPA</legend>
        <div className="mr-fields">
          {choice(
            'Percentage calculation',
            'percentageMode',
            [
              ['standard', 'Obtained ÷ maximum × 100'],
              ['weighted', 'Credit-weighted subject percentages'],
              ['cgpa_95', 'CGPA × 9.5'],
              ['custom', 'Custom expression'],
            ],
            'standard',
          )}
          {choice(
            'GPA calculation',
            'gpaMode',
            [
              ['average', 'Average subject grade points'],
              ['credit', 'Credit SGPA: Σ(Credits × GP) ÷ ΣCredits'],
              ['us4', 'US 4.0 scale (normalized grade points)'],
              ['percentage', 'Percentage ÷ 10'],
            ],
            'average',
          )}
          {choice(
            'Decimal precision',
            'decimals',
            [
              ['0', 'Whole number'],
              ['1', '1 decimal'],
              ['2', '2 decimals'],
            ],
            '2',
          )}
        </div>
        {rules.percentageMode === 'custom' && (
          <div className="mr-formula-box">
            <label>
              Percentage expression
              <input
                maxLength={240}
                value={rules.formula ?? '(SUM / MAX_SUM) * 100'}
                onChange={(e) => set('formula', e.target.value)}
              />
            </label>
            <p>
              Variables: SUM, MAX_SUM, COUNT, AVG, MIN, MAX, CGPA, CREDITS. Operators: + − * /,
              parentheses, ROUND(value, decimals).
            </p>
            <div className="mr-actions">
              {['(SUM / MAX_SUM) * 100', '((SUM - MIN) / (MAX_SUM - MAX_SUM / COUNT)) * 100'].map(
                (expr, i) => (
                  <button
                    className="button-secondary"
                    type="button"
                    key={expr}
                    onClick={() => set('formula', expr)}
                  >
                    {i ? 'Drop lowest' : 'Standard'}
                  </button>
                ),
              )}
              {examId && (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const value = await resultsRequest<{
                        percentage: string | null
                        formulaError: string | null
                        formulaVariables: Record<string, string>
                        name: string
                      }>(token, `exams/${examId}/formula-preview`, {
                        rules: {
                          ...rules,
                          decimals: Number(rules.decimals),
                          formula: rules.formula || '(SUM / MAX_SUM) * 100',
                        },
                      })
                      setTest(
                        `${value.name}: ${value.formulaError || `${value.percentage ?? 'Incomplete'}%`} · ${Object.entries(
                          value.formulaVariables,
                        )
                          .map(([k, v]) => `${k}=${v}`)
                          .join(' · ')}`,
                      )
                    } catch (e) {
                      setTest(errorMessage(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {busy ? 'Calculating…' : 'Test on first student'}
                </button>
              )}
            </div>
            <output aria-live="polite">{test}</output>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>3 · Pass, grace & classification</legend>
        <div className="mr-fields">
          {numeric('Overall pass percentage', 'overallPass', 0)}
          {numeric('Grace marks budget per student', 'grace', 0)}
          {numeric('Maximum compartment subjects', 'compartment', 0, 2)}
          <label>
            Subject pass rule
            <select
              value={rules.requireEverySubject === false ? 'overall' : 'every'}
              onChange={(e) => set('requireEverySubject', e.target.value === 'every')}
            >
              <option value="every">Pass every included subject component</option>
              <option value="overall">Overall aggregate only</option>
            </select>
          </label>
        </div>
        <p className="mr-muted">
          Grace is allocated in subject/component order only to present scores within the budget.
          Original marks remain unchanged; reports disclose the grace awarded.
        </p>
        <div className="mr-fields">
          {['Distinction', 'First division', 'Second division', 'Third division'].map(
            (label, i) => (
              <label key={label}>
                {label} ≥ %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step=".01"
                  value={(rules.divisions || [75, 60, 45, 33])[i]}
                  onChange={(e) =>
                    set(
                      'divisions',
                      (rules.divisions || [75, 60, 45, 33]).map((v, n) =>
                        n === i ? Number(e.target.value) : v,
                      ),
                    )
                  }
                />
              </label>
            ),
          )}
        </div>
      </fieldset>
      <fieldset>
        <legend>4 · Class ranking</legend>
        <div className="mr-fields">
          {choice(
            'Ranking method',
            'rankMethod',
            [
              ['competition', 'Competition: 1, 2, 2, 4'],
              ['dense', 'Dense: 1, 2, 2, 3'],
              ['unique', 'Unique: highest subject, total, stable student ID'],
            ],
            'competition',
          )}
          {choice(
            'Rank basis',
            'rankBasis',
            [
              ['percentage', 'Overall percentage'],
              ['total', 'Grand total'],
              ['gpa', 'GPA / SGPA'],
            ],
            'percentage',
          )}
          {choice(
            'Rank eligibility',
            'rankEligibility',
            [
              ['all', 'All complete results'],
              ['passed', 'Passed students only'],
            ],
            'all',
          )}
          {choice(
            'Rank display',
            'rankFormat',
            [
              ['of_total', 'Rank X of N'],
              ['ordinal', 'Ordinal: 1st, 2nd, 3rd'],
              ['hash', 'Hash: #1, #2, #3'],
            ],
            'of_total',
          )}
        </div>
      </fieldset>
      <fieldset>
        <legend>5 · Grade scale & performance remarks</legend>
        <div className="mr-actions">
          {Object.keys(scales).map((name) => (
            <button
              type="button"
              className="button-secondary"
              key={name}
              onClick={() => set('grades', scales[name])}
            >
              {name} preset
            </button>
          ))}
        </div>
        <p className="mr-muted">
          Highest matching minimum wins. Include a zero boundary. Grade points use a 0–10 scale; US
          GPA normalizes to 0–4.
        </p>
        <div className="mr-table-scroll">
          <table className="mr-table">
            <thead>
              <tr>
                <th>Minimum %</th>
                <th>Grade</th>
                <th>Points</th>
                <th>Auto remark</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {rules.grades.map((g, i) => {
                const update = (patch: Partial<typeof g>) =>
                  set(
                    'grades',
                    rules.grades.map((value, n) => (n === i ? { ...value, ...patch } : value)),
                  )
                return (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Grade ${i + 1} minimum`}
                        type="number"
                        min="0"
                        max="100"
                        step=".01"
                        value={g.minimum}
                        onChange={(e) => update({ minimum: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Grade ${i + 1} label`}
                        required
                        maxLength={20}
                        value={g.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Grade ${i + 1} points`}
                        type="number"
                        min="0"
                        max="10"
                        step=".01"
                        value={g.points ?? g.minimum / 10}
                        onChange={(e) => update({ points: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Grade ${i + 1} remark`}
                        maxLength={200}
                        value={g.remark ?? ''}
                        onChange={(e) => update({ remark: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mr-link"
                        disabled={rules.grades.length === 1}
                        onClick={() =>
                          set(
                            'grades',
                            rules.grades.filter((_, n) => n !== i),
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          className="button-secondary"
          type="button"
          disabled={rules.grades.length >= 20}
          onClick={() =>
            set('grades', [...rules.grades, { minimum: 0, label: 'New', points: 0, remark: '' }])
          }
        >
          Add grade rule
        </button>
      </fieldset>
    </section>
  )
}
