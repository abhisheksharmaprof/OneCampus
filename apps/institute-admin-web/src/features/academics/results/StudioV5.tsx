import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, resultsRequest, type Section } from './results.api'

interface Workspace {
  id: string
  name: string
  sectionId: string
  examId: string | null
  updatedAt: string
  students: number
  state?: Record<string, unknown>
}
interface Reply {
  type: string
  channel: string
  requestId?: string
  state?: Record<string, unknown>
  message?: string
  students?: number
  html?: string
  styles?: string
  width?: number
}
export function StudioV5({
  token,
  section,
  examId,
  onDirty,
}: {
  token: string
  section: Section
  examId: string
  onDirty: (dirty: boolean) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const container = useRef<HTMLElement>(null)
  const [channel] = useState(() => crypto.randomUUID())
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    'Original v5 studio · sample dataset. Load an exam to use school marks.',
  )
  const [name, setName] = useState('Marksheet Studio working copy')
  const [saved, setSaved] = useState<Workspace[]>([])
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [sourceExam, setSourceExam] = useState<string | null>(null)
  const [students, setStudents] = useState(12)
  const modified = useRef(false)
  const pending = useRef(
    new Map<
      string,
      {
        resolve: (value: Record<string, unknown>) => void
        reject: (e: Error) => void
        timer: ReturnType<typeof setTimeout>
      }
    >(),
  )
  const source = `/marksheet-studio/v5.html#channel=${channel}&parentOrigin=${encodeURIComponent(window.location.origin)}`
  const post = useCallback(
    (type: string, payload?: unknown, requestId?: string) =>
      frame.current?.contentWindow?.postMessage({ type, channel, payload, requestId }, '*'),
    [channel],
  )
  const ask = (type: string, payload?: unknown) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = crypto.randomUUID()
      const timer = setTimeout(() => {
        pending.current.delete(id)
        reject(new Error('The studio did not respond. Reload the screen and try again.'))
      }, 15000)
      pending.current.set(id, { resolve, reject, timer })
      post(type, payload, id)
    })
  useEffect(() => {
    const controller = new AbortController()
    const requests = pending.current
    const listener = (event: MessageEvent<Reply>) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== 'null' ||
        event.data?.channel !== channel
      )
        return
      const data = event.data
      if (data.type === 'studio:render' && data.requestId) {
        void import('./studio/render')
          .then(({ renderStudioImage }) =>
            renderStudioImage(data.html!, data.styles!, data.width!),
          )
          .then((image) => post('campusone:rendered', { image }, data.requestId))
          .catch((e) => post('campusone:rendered', { error: errorMessage(e) }, data.requestId))
        return
      }
      if (data.type === 'studio:ready') {
        setReady(true)
        setStudents(data.students ?? 12)
        void resultsRequest<Record<string, unknown>>(
          token,
          'studio/branding',
          undefined,
          'GET',
          controller.signal,
        )
          .then((brand) => {
            if (controller.signal.aborted) return
            const { warning, ...template } = brand
            post('campusone:branding', { ...template, session: section.year })
            if (warning) setNotice(String(warning))
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(errorMessage(e))
          })
      }
      if (data.type === 'studio:dirty') {
        modified.current = true
        onDirty(true)
        if (data.students !== undefined) setStudents(data.students)
      }
      if (data.type === 'studio:status' && data.students !== undefined) setStudents(data.students)
      if (data.requestId) {
        const item = requests.get(data.requestId)
        if (item) {
          clearTimeout(item.timer)
          requests.delete(data.requestId)
          if (data.type === 'studio:error')
            item.reject(new Error(data.message || 'Studio request failed.'))
          else item.resolve(data.state || {})
        }
      }
    }
    window.addEventListener('message', listener)
    void resultsRequest<Workspace[]>(
      token,
      `studio/workspaces?sectionId=${section.id}`,
      undefined,
      'GET',
      controller.signal,
    )
      .then((list) => {
        if (!controller.signal.aborted) setSaved(list)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e))
      })
    return () => {
      controller.abort()
      window.removeEventListener('message', listener)
      for (const request of requests.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('Studio closed.'))
      }
      requests.clear()
    }
  }, [channel, token, section.id, section.year, onDirty, post])
  const operation = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const loadExam = () =>
    operation(async () => {
      if (
        modified.current && !window.confirm(
          'Replace the studio working copy with the selected exam? Save your edits first if needed.',
        )
      )
        return
      const data = await resultsRequest<{
        state: Record<string, unknown>
        name: string
        warnings: string[]
      }>(token, `studio/exams/${examId}/source`)
      await ask('campusone:load', data.state)
      setWorkspace(null)
      setSourceExam(examId)
      setName(`${data.name} · Studio`)
      modified.current = false
      onDirty(false)
      setNotice(`Loaded ${data.name}. ${data.warnings.join(' ')}`)
    })
  const loadSaved = (id: string) =>
    operation(async () => {
      if (!id || (modified.current && !window.confirm('Load this saved workspace and replace the current working copy?')))
        return
      const data = await resultsRequest<Workspace>(token, `studio/workspaces/${id}`)
      await ask('campusone:load', data.state)
      setWorkspace(data)
      setSourceExam(data.examId)
      setName(data.name)
      modified.current = false
      onDirty(false)
      setNotice(`Loaded saved workspace: ${data.name}`)
    })
  const save = (copy = false) =>
    operation(async () => {
      const state = await ask('campusone:snapshot')
      const body = {
        id: copy ? undefined : workspace?.id,
        updatedAt: workspace?.updatedAt,
        sectionId: section.id,
        examId: sourceExam,
        name: name.trim(),
        state,
      }
      if (new TextEncoder().encode(JSON.stringify(body)).length > 2000000)
        throw new Error('Workspace exceeds 2 MB. Reduce uploaded image sizes before saving.')
      const result = await resultsRequest<Workspace>(token, 'studio/workspaces', body)
      setWorkspace(result)
      setSaved((current) => [result, ...current.filter((w) => w.id !== result.id)])
      modified.current = false
      onDirty(false)
      setNotice(
        `Saved ${result.name} · ${result.students} students. Approved marks and issued PDFs are unchanged.`,
      )
    })
  return (
    <section className="mr-studio-v5" ref={container} aria-label="Original Marksheet Studio v5">
      <div className="mr-studio-toolbar">
        <div>
          <span className="mr-eyebrow">Original v5 · full feature studio</span>
          <h2>Marksheet Studio Pro</h2>
          <p className="mr-muted">
            Exact supplied templates and controls · {section.grade} / {section.section} · {students}{' '}
            students
          </p>
        </div>
        <div className="mr-actions">
          <button
            className="button-secondary"
            disabled={!ready || busy || !examId}
            onClick={() => void loadExam()}
          >
            Load selected exam
          </button>
          <button
            className="button-secondary"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen()
              else
                void container.current
                  ?.requestFullscreen()
                  .catch(() => setError('Full-screen mode is unavailable.'))
            }}
          >
            Full-screen studio
          </button>
        </div>
      </div>
      <div className="mr-studio-save">
        <label>
          Workspace name
          <input
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value)
              modified.current = true
              onDirty(true)
            }}
          />
        </label>
        <label>
          Saved studio workspace
          <select
            aria-label="Saved studio workspace"
            value={workspace?.id || ''}
            disabled={!ready || busy}
            onChange={(e) => void loadSaved(e.target.value)}
          >
            <option value="">Choose a working copy</option>
            {saved.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.students} students
              </option>
            ))}
          </select>
        </label>
        <button
          className="button-primary"
          disabled={!ready || busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? 'Working…' : 'Save workspace'}
        </button>
        {workspace && (
          <button
            className="button-secondary"
            disabled={busy || !ready}
            onClick={() => void save(true)}
          >
            Save as new
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mr-error">
          {error}
        </p>
      )}
      <p className="mr-studio-status" role="status">
        {ready ? notice : 'Loading the original studio and local fonts…'}
      </p>
      <iframe
        ref={frame}
        src={source}
        title="Marksheet Studio Pro v5 exact reference"
        className="mr-studio-frame"
        inert={busy}
        sandbox="allow-scripts allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox"
        allow="fullscreen"
      />
    </section>
  )
}
