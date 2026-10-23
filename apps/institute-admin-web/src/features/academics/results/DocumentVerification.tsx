import { useState } from 'react'
import { downloadBatch, errorMessage, resultsRequest } from './results.api'
interface Verified {
  id: string
  student: { name: string; roll: string }
  title: string
  exams: string[]
  issued: boolean
  createdAt: string
  ready: boolean
  sha256: string | null
  batchId: string
  superseded: boolean
}
export function DocumentVerification({ token }: { token: string }) {
  const [id, setId] = useState('')
  const [result, setResult] = useState<Verified | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <details className="mr-verification">
      <summary>Verify a marksheet document reference</summary>
      <p className="mr-muted">
        Paste the document ID printed beneath its QR code. Verification is restricted to your
        authorized school and branch.
      </p>
      <div className="mr-actions">
        <input
          aria-label="Marksheet document reference"
          value={id}
          maxLength={100}
          placeholder="UUID from marksheet QR"
          onChange={(e) => {
            setId(e.target.value)
            setResult(null)
          }}
        />
        <button
          className="button-secondary"
          disabled={busy || !id.trim()}
          onClick={async () => {
            setBusy(true)
            setError('')
            setResult(null)
            try {
              const value = id.trim().replace(/^CampusOne result /, '')
              if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error('Enter a valid document UUID.')
              setResult(await resultsRequest(token, `documents/${value}/verify`))
            } catch (e) {
              setError(errorMessage(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Verifying…' : 'Verify document'}
        </button>
      </div>
      {error && (
        <p className="mr-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <output aria-live="polite">
          <strong>
            {result.issued ? 'Issued original' : 'Draft document'}
            {result.superseded ? ' · A corrected successor exists' : ''}
          </strong>
          <p>
            {result.student.name} · Roll {result.student.roll}
            <br />
            {result.title} · {result.exams.join(', ')}
            <br />
            {new Date(result.createdAt).toLocaleString()}
          </p>
          <p>PDF SHA-256: {result.sha256 || 'Not rendered yet'}</p>
          {result.ready && (
            <button
              className="button-secondary"
              onClick={() =>
                downloadBatch(token, result.batchId, 'pdf', result.id).catch((e) =>
                  setError(errorMessage(e)),
                )
              }
            >
              Download stored original
            </button>
          )}
        </output>
      )}
    </details>
  )
}
