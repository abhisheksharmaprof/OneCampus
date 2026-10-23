import { Modal } from '../../../components/admin-ui/Modal'
import { useState } from 'react'
import { errorMessage, resultsRequest, type ExamDetail } from './results.api'
export function LegacyMigration({
  token,
  record,
  detail,
  onClose,
  onSaved,
}: {
  token: string
  record: {
    id: string
    kind: string
    title: string
    payload: Record<string, unknown>
  }
  detail: ExamDetail
  onClose: () => void
  onSaved: () => void
}) {
  const [candidate, setCandidate] = useState('')
  const [component, setComponent] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open
      title="Reconcile previous academic record"
      onClose={() => {
        if (!busy) onClose()
      }}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      size="large"
    >
      <section className="mr-history">
        <p>
          <strong>{record.title}</strong>
        </p>
        <p>Destination: {detail.exam.name}. The original record is retained.</p>
        <pre>{JSON.stringify(record.payload, null, 2)}</pre>
        {record.kind === 'MARK' && (
          <div className="mr-fields">
            <label>
              Match enrolled student
              <select value={candidate} onChange={(e) => setCandidate(e.target.value)}>
                <option value="">Choose student explicitly</option>
                {detail.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.roll} · {c.name} · {c.admission}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Match subject / component
              <select value={component} onChange={(e) => setComponent(e.target.value)}>
                <option value="">Choose subject explicitly</option>
                {detail.subjects.flatMap((s) =>
                  s.components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {s.name} / {c.name} / maximum {c.maximum}
                    </option>
                  )),
                )}
              </select>
            </label>
          </div>
        )}
        <label className="mr-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I checked this record against the selected exam, student, and subject.
        </label>
        {error && (
          <p role="alert" className="mr-error">
            {error}
          </p>
        )}
        <button
          className="button-primary"
          disabled={busy || !confirmed || (record.kind === 'MARK' && (!candidate || !component))}
          onClick={async () => {
            setBusy(true)
            try {
              await resultsRequest(token, `legacy/${record.id}/migrate`, {
                examId: detail.exam.id,
                candidateId: candidate,
                componentId: component,
              })
              onSaved()
            } catch (e) {
              setError(errorMessage(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Reconciling…' : 'Reconcile record'}
        </button>
      </section>
    </Modal>
  )
}
