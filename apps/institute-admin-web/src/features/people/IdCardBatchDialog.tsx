import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/admin-ui'
import { AdminApiError } from '../admin/admin.api'
import { listDocumentTemplates, preflightIdCards, type DocumentTemplateRecord, type IdCardPreflight } from '../documents/documents.api'
import { prepareCardBatch, renderCardCalibration } from '../documents/engine/idCardBatchRender'
import { openPrintWindow } from '../documents/engine/docRender'
import './IdCardBatchDialog.css'

type PreflightWithFingerprint = IdCardPreflight & { fingerprint: string }

type BatchSnapshot = {
  templateVersionId: string
  studentIds: string[]
  acceptMissingPhotos: boolean
}

type BatchReview = {
  preflight: PreflightWithFingerprint
  snapshot: BatchSnapshot
  scope: string
  html: string | null
}

const IMAGE_READY_TIMEOUT_MS = 7_000

export function IdCardBatchDialog({ open, onClose, accessToken, studentIds, onRemove }: {
  open: boolean
  onClose: () => void
  accessToken: string
  studentIds: string[]
  onRemove: (studentId: string) => void
}) {
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([])
  const [templateVersionId, setTemplateVersionId] = useState('')
  const [acceptMissingPhotos, setAcceptMissingPhotos] = useState(false)
  const [review, setReview] = useState<BatchReview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshNeedsReview, setRefreshNeedsReview] = useState(false)
  const [checkingScope, setCheckingScope] = useState<string | null>(null)
  const [printingScope, setPrintingScope] = useState<string | null>(null)
  const contextVersion = useRef(0)
  const reviewVersion = useRef(0)
  const controllers = useRef(new Set<AbortController>())
  const studentKey = useMemo(() => JSON.stringify(studentIds), [studentIds])
  const scope = JSON.stringify([open, accessToken, studentKey])
  const activeScope = useRef(scope)
  const validBatch = studentIds.length >= 1 && studentIds.length <= 80
  const selected = templates.find((template) => template.publishedVersion?.id === templateVersionId)
  const reviewMatchesCurrentInputs = review?.snapshot.templateVersionId === templateVersionId
    && review.snapshot.acceptMissingPhotos === acceptMissingPhotos
    && review.snapshot.studentIds.length === studentIds.length
    && review.snapshot.studentIds.every((studentId, index) => studentId === studentIds[index])
  const checking = checkingScope === scope
  const printing = printingScope === scope
  const visibleReview = reviewMatchesCurrentInputs && review?.scope === scope ? review : null
  const visibleNotice = visibleReview ? notice : ''
  const visibleError = error
  const visibleRefreshNeedsReview = refreshNeedsReview && reviewMatchesCurrentInputs
  const setPrinting = (value: boolean) => setPrintingScope(value ? scope : null)
  const invalidateReview = () => {
    reviewVersion.current += 1
    setReview(null)
    setNotice('')
    setRefreshNeedsReview(false)
  }

  const abortRequests = () => {
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
  }

  useEffect(() => {
    activeScope.current = scope
    contextVersion.current += 1
    reviewVersion.current += 1
    abortRequests()
    if (!open) return
    const controller = new AbortController()
    const version = contextVersion.current
    controllers.current.add(controller)
    listDocumentTemplates(accessToken, 'ID_CARD', controller.signal)
      .then((page) => {
        if (controller.signal.aborted || version !== contextVersion.current) return
        setTemplates(page.items.filter((template) => template.publishedVersion))
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || version !== contextVersion.current) return
        setError(cause instanceof Error ? cause.message : 'Published templates could not be loaded.')
      })
      .finally(() => controllers.current.delete(controller))
    return () => controller.abort()
  }, [accessToken, open, scope])

  const isCurrent = (context: number, revision: number, requestScope: string) => open && context === contextVersion.current && revision === reviewVersion.current && requestScope === activeScope.current

  const resetForInputChange = () => {
    invalidateReview()
    setError('')
  }

  const selectTemplate = (versionId: string) => {
    setTemplateVersionId(versionId)
    resetForInputChange()
  }

  const setPlaceholderAcknowledgement = (checked: boolean) => {
    setAcceptMissingPhotos(checked)
    resetForInputChange()
  }

  const check = async () => {
    if (!selected?.publishedVersion || !validBatch) return
    const snapshot: BatchSnapshot = {
      templateVersionId: selected.publishedVersion.id,
      studentIds: [...studentIds],
      acceptMissingPhotos,
    }
    const context = contextVersion.current
    const revision = ++reviewVersion.current
    const requestScope = scope
    const controller = new AbortController()
    controllers.current.add(controller)
    setCheckingScope(scope)
    setReview(null)
    setError('')
    setNotice('')
    setRefreshNeedsReview(false)
    try {
      const preflight = await preflightIdCards(accessToken, snapshot) as PreflightWithFingerprint
      if (!isCurrent(context, revision, requestScope) || controller.signal.aborted) return
      if (!preflight.ready) {
        setReview({ preflight, snapshot, scope: requestScope, html: null })
        return
      }
      const html = await prepareCardBatch(preflight)
      await waitForCardImages(html)
      if (!isCurrent(context, revision, requestScope) || controller.signal.aborted) return
      setReview({ preflight, snapshot, scope: requestScope, html })
    } catch (cause) {
      if (!isCurrent(context, revision, requestScope) || controller.signal.aborted) return
      setError(cause instanceof AdminApiError ? cause.message : cause instanceof Error ? cause.message : 'The batch could not be checked.')
    } finally {
      controllers.current.delete(controller)
      setCheckingScope((current) => current === requestScope ? null : current)
    }
  }

  const removeStudent = (studentId: string) => {
    invalidateReview()
    setError('')
    onRemove(studentId)
  }

  const close = () => {
    contextVersion.current += 1
    reviewVersion.current += 1
    abortRequests()
    setCheckingScope((current) => current === scope ? null : current)
    setPrintingScope((current) => current === scope ? null : current)
    onClose()
  }

  const printCalibration = () => {
    const popup = window.open('', '_blank', 'width=900,height=900')
    if (!popup) {
      setError('The calibration popup was blocked by the browser.')
      return
    }
    openPrintWindow(renderCardCalibration(), popup)
  }

  const print = async () => {
    if (!review?.html || !review.preflight.ready || !reviewMatchesCurrentInputs || printing) return
    const popup = window.open('', '_blank', 'width=900,height=900')
    if (!popup) {
      setError('The print popup was blocked by the browser.')
      return
    }
    popup.opener = null

    const context = contextVersion.current
    const revision = reviewVersion.current
    const requestScope = scope
    const controller = new AbortController()
    controllers.current.add(controller)
    setPrinting(true)
    setError('')
    setNotice('')
    try {
      const refreshed = await preflightIdCards(accessToken, review.snapshot) as PreflightWithFingerprint
      if (!isCurrent(context, revision, requestScope) || controller.signal.aborted) {
        popup.close()
        return
      }
      if (!refreshed.ready) {
        popup.close()
        setReview({ preflight: refreshed, snapshot: review.snapshot, scope: requestScope, html: null })
        setNotice('The batch changed and must be fixed before printing.')
        return
      }
      if (refreshed.fingerprint === review.preflight.fingerprint) {
        openPrintWindow(review.html, popup)
        return
      }

      const html = await prepareCardBatch(refreshed)
      await waitForCardImages(html)
      if (!isCurrent(context, revision, requestScope) || controller.signal.aborted) {
        popup.close()
        return
      }
      popup.close()
      setReview({ preflight: refreshed, snapshot: review.snapshot, scope: requestScope, html })
      setRefreshNeedsReview(true)
      setNotice('The batch changed. Review the refreshed preview, then choose Print again to confirm it.')
    } catch (cause) {
      popup.close()
      if (!isCurrent(context, revision, requestScope) || controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Cards could not be printed.')
    } finally {
      controllers.current.delete(controller)
      setPrintingScope((current) => current === requestScope ? null : current)
    }
  }

  return <Modal open={open} title="Generate student ID cards" size="large" onClose={close}
    description="Choose an immutable published design, check every selected student, review the A4 front and back sheets, then print at actual size.">
    <div className="id-card-review">
      <div className="id-card-review__summary" aria-live="polite">
        <strong>{studentIds.length} selected</strong><span>Maximum 80 per batch</span>
      </div>
      {!validBatch && <p className="id-card-review__alert" role="alert">
        {studentIds.length === 0 ? 'Select at least one student before checking a batch.' : `Remove ${studentIds.length - 80} students before checking this batch.`}
      </p>}

      <label className="id-card-review__field" htmlFor="id-card-published-version">
        <span>Published ID-card version</span>
        <select id="id-card-published-version" value={templateVersionId} onChange={(event) => selectTemplate(event.target.value)} disabled={checking || printing}>
          <option value="">Choose a published version</option>
          {templates.map((template) => <option key={template.publishedVersion?.id} value={template.publishedVersion?.id}>
            {template.publishedVersion?.name} · version {template.publishedVersion?.version}
          </option>)}
        </select>
        <small>A published version is immutable; draft edits cannot change this batch.</small>
      </label>
      {!templates.length && !error && <p className="id-card-review__hint">Published templates load here when available. Publish one in Template Studio if none appear.</p>}

      <label className="id-card-review__checkbox">
        <input type="checkbox" checked={acceptMissingPhotos} onChange={(event) => setPlaceholderAcknowledgement(event.target.checked)} disabled={checking || printing} />
        <span>Use the template’s initials placeholder when a student photo is missing.</span>
      </label>
      <p className="id-card-review__hint">Changing this acknowledgement clears the current check and requires a new preflight.</p>

      <div className="id-card-review__controls">
        <button type="button" className="button-secondary" disabled={checking || printing || !selected || !validBatch} onClick={() => void check()}>
          {checking ? 'Checking selected students…' : 'Check selected students'}
        </button>
        <button type="button" className="button-secondary" disabled={checking || printing} onClick={printCalibration}>Print test sheet</button>
      </div>

      {visibleError && <p className="id-card-review__alert" role="alert">{visibleError}</p>}
      {visibleNotice && <p className="id-card-review__notice" role="status">{visibleNotice}</p>}

      {visibleReview && <section className="id-card-review__results" aria-live="polite" aria-label="Student preflight results">
        <h3>{visibleReview.preflight.ready && visibleReview.html ? `Preview ready for ${visibleReview.preflight.students.length} students` : 'Fix preflight issues before printing'}</h3>
        <ol className="id-card-review__students">
          {visibleReview.preflight.students.map((student) => <li key={student.studentId} className={student.issues.length ? 'has-issues' : undefined}>
            <div>
              <strong>{student.name || student.studentId}</strong>
              {student.admissionNumber && <span> · {student.admissionNumber}</span>}
              {student.missingPhoto && <span> · initials placeholder</span>}
              {student.issues.length > 0 && <ul>{student.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            </div>
            <button type="button" className="button-secondary" disabled={checking || printing} onClick={() => removeStudent(student.studentId)} aria-label={`Remove ${student.name || student.studentId} from batch`}>Remove</button>
          </li>)}
        </ol>
        {visibleReview.html && <div className="id-card-preview">
          <div className="id-card-preview__heading">
            <div><h3>A4 front and back preview</h3><p>Review this exact batch before printing. The sheets are shown at A4 geometry and may scroll.</p></div>
            <span>Published version {visibleReview.preflight.version}</span>
          </div>
          <iframe className="id-card-preview__frame" title="A4 front and back ID card sheets preview" sandbox="" srcDoc={visibleReview.html} />
        </div>}
      </section>}

      <p className="id-card-review__print-note">Print A4 portrait at actual size / 100%, with background graphics enabled, no headers or footers, and long-edge duplex. Use the test sheet to check paper alignment first.</p>
      <div className="id-card-actions">
        <button type="button" className="button-primary" disabled={checking || printing || !visibleReview?.html || !visibleReview.preflight.ready || !reviewMatchesCurrentInputs} onClick={() => {
          if (visibleRefreshNeedsReview) {
            setRefreshNeedsReview(false)
            setNotice('Refreshed preview reviewed. Select Print again to confirm the current server batch.')
            return
          }
          void print()
        }}>
          {printing ? 'Confirming batch…' : 'Print front and back sheets'}
        </button>
      </div>
    </div>
  </Modal>
}

function waitForCardImages(html: string): Promise<void> {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const sources = Array.from(new Set(Array.from(document.images, (image) => image.src))).filter(Boolean)
  if (sources.length === 0) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (cause?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (cause) reject(cause)
      else resolve()
    }
    const timeout = window.setTimeout(() => finish(new Error('Card images took too long to load. Try again.')), IMAGE_READY_TIMEOUT_MS)
    Promise.all(sources.map((src) => new Promise<void>((resolveImage, rejectImage) => {
      const image = new Image()
      image.onload = () => resolveImage()
      image.onerror = () => rejectImage(new Error('A card image could not be loaded. Try again.'))
      image.src = src
    }))).then(() => finish(), (cause: unknown) => finish(cause instanceof Error ? cause : new Error('A card image could not be loaded. Try again.')))
  })
}
