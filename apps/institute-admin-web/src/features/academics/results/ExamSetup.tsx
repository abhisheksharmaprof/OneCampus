import { Modal } from '../../../components/admin-ui/Modal'
import { useState, type FormEvent } from 'react'
import { EngineSettings } from './EngineSettings'
import { Plus, X } from 'lucide-react'
import { errorMessage, resultsRequest, type Exam, type Rules, type Section } from './results.api'

const defaultRules: Rules = {
  grades: [
    { label: 'A+', minimum: 90 },
    { label: 'A', minimum: 80 },
    { label: 'B', minimum: 70 },
    { label: 'C', minimum: 60 },
    { label: 'D', minimum: 40 },
    { label: 'E', minimum: 0 },
  ],
  decimals: 2,
}
type SubjectInput = {
  selected: boolean
  components: {
    id?: string
    name: string
    maximum: string
    passMarks: string
  }[]
}
export function ExamSetup({
  token,
  section,
  initialExam,
  onClose,
  onCreated,
}: {
  token: string
  initialExam?: Exam
  section: Section
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState(initialExam?.name || '')
  const [type, setType] = useState(initialExam?.examType || 'HALF_YEARLY')
  const [term, setTerm] = useState(initialExam?.termId || '')
  const [examDate, setExamDate] = useState(initialExam?.examDate || '')
  const [subjects, setSubjects] = useState<Record<string, SubjectInput>>(() =>
    Object.fromEntries(
      section.subjects.map((s) => [
        s.id,
        {
          selected: !initialExam || initialExam.subjects.some((sheet) => sheet.subjectId === s.id),
          components: initialExam?.subjects.find((sheet) => sheet.subjectId === s.id)
            ?.components || [{ name: 'Total', maximum: s.maximum, passMarks: '0' }],
        },
      ]),
    ),
  )
  const [rules, setRules] = useState(initialExam?.rules || defaultRules)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (id: string, fn: (s: SubjectInput) => SubjectInput) =>
    setSubjects((current) => ({ ...current, [id]: fn(current[id]) }))
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const exam = await resultsRequest<{ id: string }>(
        token,
        initialExam ? `exams/${initialExam.id}/settings` : 'exams',
        {
          name,
          updatedAt: initialExam?.updatedAt,
          examDate: examDate || null,
          examType: type,
          termId: term || null,
          sectionId: section.id,
          rules: {
            ...rules,
            decimals: Number(rules.decimals),
            formula: rules.formula || '(SUM / MAX_SUM) * 100',
            subjects: Object.fromEntries(
              Object.entries(rules.subjects || {}).filter(([id]) => subjects[id]?.selected),
            ),
          },
          subjects: Object.entries(subjects)
            .filter(([, s]) => s.selected)
            .map(([subjectId, s]) => ({ subjectId, components: s.components })),
        },
        initialExam ? 'PATCH' : 'POST',
      )
      onCreated(exam.id)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      title="Set up an exam"
      onClose={() => {
        if (!busy) onClose()
      }}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      size="large"
    >
      <form className="mr-setup" onSubmit={submit}>
        {error && (
          <div role="alert" className="mr-error">
            {error}
          </div>
        )}
        <div className="mr-fields">
          <label>
            Exam name
            <input
              required
              maxLength={120}
              placeholder="e.g. Half-yearly 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Exam type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="UNIT_TEST">Unit test</option>
              <option value="HALF_YEARLY">Half-yearly</option>
              <option value="ANNUAL">Annual</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Exam date
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
          <label>
            Academic term
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">No specific term</option>
              {section.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Decimal places
            <select
              value={rules.decimals}
              onChange={(e) => setRules({ ...rules, decimals: Number(e.target.value) })}
            >
              {[0, 1, 2].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <h3>Subjects & marking scheme</h3>
        <p className="mr-muted">
          Passing marks of 0 means no minimum. Add written, practical, or internal components where
          needed.
        </p>
        {!section.subjects.length && (
          <p className="mr-error">Configure subjects for this class in Academic Structure first.</p>
        )}
        <div className="mr-actions">
          {[33, 40].map((pass) => (
            <button
              type="button"
              className="button-secondary"
              key={pass}
              onClick={() =>
                setSubjects((current) =>
                  Object.fromEntries(
                    Object.entries(current).map(([id, state]) => [
                      id,
                      {
                        ...state,
                        components:
                          state.components.length === 1
                            ? [{ ...state.components[0], maximum: '100', passMarks: String(pass) }]
                            : state.components,
                      },
                    ]),
                  ),
                )
              }
            >
              Set single-component subjects to 100 / {pass}
            </button>
          ))}
        </div>
        <div className="mr-subject-setup">
          {section.subjects.map((subject) => {
            const state = subjects[subject.id]
            return (
              <section key={subject.id}>
                <label className="mr-check">
                  <input
                    type="checkbox"
                    checked={state.selected}
                    onChange={(e) =>
                      update(subject.id, (s) => ({
                        ...s,
                        selected: e.target.checked,
                      }))
                    }
                  />
                  <strong>{subject.name}</strong>
                  {subject.elective && <small>Elective</small>}
                </label>
                {state.selected && (
                  <>
                    {state.components.map((c, i) => (
                      <div className="mr-component-fields" key={i}>
                        <label>
                          Component
                          <input
                            required
                            aria-label={`${subject.name} component ${i + 1}`}
                            value={c.name}
                            maxLength={60}
                            onChange={(e) =>
                              update(subject.id, (s) => ({
                                ...s,
                                components: s.components.map((v, n) =>
                                  n === i ? { ...v, name: e.target.value } : v,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Maximum
                          <input
                            required
                            type="number"
                            min="0.01"
                            max="999999.99"
                            step=".01"
                            aria-label={`${subject.name} maximum ${i + 1}`}
                            value={c.maximum}
                            onChange={(e) =>
                              update(subject.id, (s) => ({
                                ...s,
                                components: s.components.map((v, n) =>
                                  n === i ? { ...v, maximum: e.target.value } : v,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Passing
                          <input
                            required
                            type="number"
                            min="0"
                            max={c.maximum}
                            step=".01"
                            value={c.passMarks}
                            onChange={(e) =>
                              update(subject.id, (s) => ({
                                ...s,
                                components: s.components.map((v, n) =>
                                  n === i ? { ...v, passMarks: e.target.value } : v,
                                ),
                              }))
                            }
                          />
                        </label>
                        {state.components.length > 1 && (
                          <button
                            type="button"
                            className="mr-icon"
                            aria-label={`Remove ${subject.name} component ${i + 1}`}
                            onClick={() =>
                              update(subject.id, (s) => ({
                                ...s,
                                components: s.components.filter((_, n) => n !== i),
                              }))
                            }
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="mr-link"
                      disabled={state.components.length >= 10}
                      onClick={() =>
                        update(subject.id, (s) => ({
                          ...s,
                          components: [
                            ...s.components,
                            { name: '', maximum: '20', passMarks: '0' },
                          ],
                        }))
                      }
                    >
                      <Plus size={14} />
                      Add component
                    </button>
                  </>
                )}
              </section>
            )
          })}
        </div>
        <EngineSettings
          token={token}
          examId={initialExam?.id}
          rules={rules}
          onChange={setRules}
          subjects={section.subjects.filter((s) => subjects[s.id]?.selected)}
        />
        <footer className="mr-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" disabled={busy || !section.subjects.length}>
            {busy ? 'Saving…' : initialExam ? 'Save exam setup' : 'Create exam & load students'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
