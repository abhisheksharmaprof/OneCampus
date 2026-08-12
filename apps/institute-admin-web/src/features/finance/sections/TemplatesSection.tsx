import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createTemplate, deleteTemplate, fetchInstituteBranding, listTemplates, patchTemplate,
  type Invoice, type Payment, type TemplateKind, type TemplateLayout, type TemplateRecord,
} from '../finance.api'
import { AdminApiError } from '../../admin/admin.api'
import { DEFAULT_LAYOUT, buildDocumentModel, renderDocumentHtml, resolveLayout } from '../invoiceRender'
import { StatePanel, inDays, today, useAbortableLoad, type FinanceSectionProps } from './shared'

// Sample data for the live preview — never sent to the API, just representative placeholder
// content so a template's rendering can be judged before it is saved.
const SAMPLE_INVOICE: Invoice = {
  id: 'sample', invoiceNumber: 'INV-2026-0001',
  studentId: 'sample-student', studentName: 'Aarav Sharma',
  admissionNumber: 'ADM-1042', className: 'Grade 8 - A',
  status: 'ISSUED', issueDate: today(), dueDate: inDays(15),
  lineItems: [
    { description: 'Tuition fee', period: 'Term 1', qty: 1, amount: '15000.00' },
    { description: 'Transport fee', period: 'Term 1', qty: 1, amount: '3000.00' },
  ],
  subtotal: '18000.00', discountAmount: '500.00', taxAmount: '0.00', total: '17500.00',
  notes: 'Thank you for your prompt payment.', templateId: null, totalPaid: '0.00',
}

const SAMPLE_PAYMENT: Payment = {
  id: 'sample-payment', receiptNumber: 'RCPT-2026-0001',
  invoiceId: 'sample', invoiceNumber: 'INV-2026-0001',
  studentId: 'sample-student', studentName: 'Aarav Sharma', admissionNumber: 'ADM-1042',
  amount: '17500.00', method: 'UPI', reference: 'UPI-REF-8842', remarks: '', paidAt: today(),
}

// Deliberately excludes {{institute_address}} — InstituteBranding has no address field yet
// (see Task 12 review), so offering that token here would produce a permanently-blank result.
const HEADER_TOKENS = [
  '{{student_name}}', '{{class_section}}', '{{admission_no}}', '{{invoice_no}}', '{{receipt_no}}',
  '{{issue_date}}', '{{due_date}}', '{{academic_year}}', '{{institute_name}}',
]

type Draft = { name: string; kind: TemplateKind; layout: TemplateLayout }

function draftFromRecord(record: TemplateRecord): Draft {
  return { name: record.name, kind: record.kind, layout: resolveLayout(record.layout) }
}

export default function TemplatesSection({ accessToken }: FinanceSectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  const templatesLoad = useAbortableLoad((signal) => listTemplates(accessToken, undefined, signal), [accessToken])
  const branding = useAbortableLoad((signal) => fetchInstituteBranding(accessToken, signal), [accessToken])
  const templates = templatesLoad.data?.items ?? []

  const selectTemplate = (record: TemplateRecord) => {
    setSelectedId(record.id)
    setDraft(draftFromRecord(record))
    setError(null)
  }

  // Auto-select the first template once the gallery loads, so the editor isn't empty by default.
  useEffect(() => {
    if (selectedId || draft) return
    if (templates.length) selectTemplate(templates[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the template list itself changes.
  }, [templates])

  const previewHtml = useMemo(() => {
    if (!branding.data || !draft) return ''
    const model = buildDocumentModel({
      invoice: SAMPLE_INVOICE,
      branding: branding.data,
      payment: draft.kind === 'RECEIPT' ? SAMPLE_PAYMENT : undefined,
      academicYear: '2026-27',
    })
    return renderDocumentHtml(model, draft.layout)
  }, [branding.data, draft])

  // Debounced so a fast typist doesn't trigger a full iframe document.write() on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      previewRef.current?.contentDocument?.open()
      previewRef.current?.contentDocument?.write(previewHtml)
      previewRef.current?.contentDocument?.close()
    }, 200)
    return () => clearTimeout(timer)
  }, [previewHtml])

  const createNew = () => {
    setBusy(true)
    setError(null)
    createTemplate(accessToken, { name: 'New template', kind: 'INVOICE', layout: DEFAULT_LAYOUT })
      .then((created) => {
        templatesLoad.reload()
        selectTemplate(created)
      })
      .catch((cause: unknown) => setError(cause instanceof AdminApiError ? cause.message : 'The template could not be created.'))
      .finally(() => setBusy(false))
  }

  const save = () => {
    if (!draft || !selectedId) return
    if (!draft.name.trim()) { setError('Enter a template name.'); return }
    setSaving(true)
    setError(null)
    patchTemplate(accessToken, selectedId, { name: draft.name.trim(), kind: draft.kind, layout: draft.layout })
      .then((updated) => {
        templatesLoad.reload()
        setDraft(draftFromRecord(updated))
      })
      .catch((cause: unknown) => setError(cause instanceof AdminApiError
        ? (cause.fieldErrors.name?.[0] ?? cause.fieldErrors.layout?.[0] ?? cause.message)
        : 'The template could not be saved.'))
      .finally(() => setSaving(false))
  }

  const setAsDefault = () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    patchTemplate(accessToken, selectedId, { isDefault: true })
      .then((updated) => { templatesLoad.reload(); setDraft(draftFromRecord(updated)) })
      .catch((cause: unknown) => setError(cause instanceof AdminApiError ? cause.message : 'Could not set this template as default.'))
      .finally(() => setBusy(false))
  }

  const duplicate = () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    createTemplate(accessToken, { name: `Copy of ${draft.name}`, kind: draft.kind, layout: draft.layout })
      .then((created) => { templatesLoad.reload(); selectTemplate(created) })
      .catch((cause: unknown) => setError(cause instanceof AdminApiError ? cause.message : 'The template could not be duplicated.'))
      .finally(() => setBusy(false))
  }

  const remove = (record: TemplateRecord) => {
    if (!window.confirm(`Delete template "${record.name}"? This cannot be undone.`)) return
    setDeletingId(record.id)
    setError(null)
    deleteTemplate(accessToken, record.id)
      .then(() => {
        if (selectedId === record.id) { setSelectedId(null); setDraft(null) }
        templatesLoad.reload()
      })
      .catch((cause: unknown) => setError(cause instanceof AdminApiError ? cause.message : 'The template could not be deleted.'))
      .finally(() => setDeletingId(null))
  }

  const patchLayout = (patch: (layout: TemplateLayout) => TemplateLayout) =>
    setDraft((current) => (current ? { ...current, layout: patch(current.layout) } : current))

  const updateColumn = (index: number, patch: Partial<TemplateLayout['columns'][number]>) =>
    patchLayout((layout) => ({
      ...layout,
      columns: layout.columns.map((column, position) => (position === index ? { ...column, ...patch } : column)),
    }))

  const moveColumn = (index: number, direction: -1 | 1) =>
    patchLayout((layout) => {
      const target = index + direction
      if (target < 0 || target >= layout.columns.length) return layout
      const columns = [...layout.columns]
      ;[columns[index], columns[target]] = [columns[target], columns[index]]
      return { ...layout, columns }
    })

  const items = templates
  const listLoading = templatesLoad.loading
  const listError = templatesLoad.error

  return (
    <div className="fin-gallery">
      <div>
        <div className="fin-toolbar">
          <button type="button" className="fin-btn fin-btn--primary" disabled={busy} onClick={createNew}>+ New template</button>
        </div>
        <StatePanel loading={listLoading} error={listError} onRetry={templatesLoad.reload}
          empty={!items.length} emptyMessage="No templates yet.">
          <div className="fin-gallery__list">
            {items.map((record) => (
              <button
                key={record.id}
                type="button"
                className={`fin-gallery__item ${selectedId === record.id ? 'is-active' : ''}`}
                onClick={() => selectTemplate(record)}
              >
                <strong>{record.isDefault ? '★ ' : ''}{record.name}</strong>
                <div><small>{record.kind}</small></div>
              </button>
            ))}
          </div>
        </StatePanel>
      </div>

      <div className="fin-card fin-template-editor">
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        {!draft ? (
          <p>Select a template on the left, or create a new one.</p>
        ) : (
          <>
            <div className="fin-form">
              <label>Name
                <input value={draft.name} onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))} />
              </label>
              <label>Kind
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft((current) => (current ? { ...current, kind: event.target.value as TemplateKind } : current))}
                >
                  <option value="INVOICE">Invoice</option>
                  <option value="RECEIPT">Receipt</option>
                </select>
              </label>
            </div>

            <h4>Branding</h4>
            <div className="fin-form">
              <label>Mode
                <select
                  value={draft.layout.branding.mode}
                  onChange={(event) => patchLayout((layout) => ({ ...layout, branding: { ...layout.branding, mode: event.target.value as 'institute' | 'custom' } }))}
                >
                  <option value="institute">Use institute branding</option>
                  <option value="custom">Custom branding</option>
                </select>
              </label>
              {draft.layout.branding.mode === 'custom' && (
                <>
                  <label>Display name
                    <input value={draft.layout.branding.name} onChange={(event) => patchLayout((layout) => ({ ...layout, branding: { ...layout.branding, name: event.target.value } }))} />
                  </label>
                  <label>Logo URL
                    <input value={draft.layout.branding.logoUrl} onChange={(event) => patchLayout((layout) => ({ ...layout, branding: { ...layout.branding, logoUrl: event.target.value } }))} />
                  </label>
                  <label>Primary color
                    <input type="color" value={draft.layout.branding.primary} onChange={(event) => patchLayout((layout) => ({ ...layout, branding: { ...layout.branding, primary: event.target.value } }))} />
                  </label>
                  <label>Accent color
                    <input type="color" value={draft.layout.branding.accent} onChange={(event) => patchLayout((layout) => ({ ...layout, branding: { ...layout.branding, accent: event.target.value } }))} />
                  </label>
                </>
              )}
            </div>

            <h4>Header</h4>
            <div className="fin-form">
              <label className="is-wide">Title
                <input value={draft.layout.header.title} onChange={(event) => patchLayout((layout) => ({ ...layout, header: { ...layout.header, title: event.target.value } }))} />
              </label>
            </div>
            <div className="fin-token-list">
              <small>Available tokens (click to insert into title):</small>
              <div>
                {HEADER_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    className="fin-btn fin-token-chip"
                    onClick={() => patchLayout((layout) => ({ ...layout, header: { ...layout.header, title: `${layout.header.title} ${token}`.trim() } }))}
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>

            <h4>Columns</h4>
            <div className="fin-rows">
              {draft.layout.columns.map((column, index) => (
                <div className="fin-row fin-row--column" key={column.id}>
                  <label className="fin-row__checkbox">
                    <input
                      type="checkbox"
                      checked={column.enabled}
                      onChange={(event) => updateColumn(index, { enabled: event.target.checked })}
                    />
                  </label>
                  <input value={column.label} onChange={(event) => updateColumn(index, { label: event.target.value })} />
                  <select value={column.align} onChange={(event) => updateColumn(index, { align: event.target.value as 'left' | 'center' | 'right' })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                  <input
                    type="number" min={1} max={100} value={column.width}
                    onChange={(event) => updateColumn(index, { width: Number(event.target.value) || 1 })}
                  />
                  <div className="fin-row__reorder">
                    <button type="button" className="fin-btn" disabled={index === 0} onClick={() => moveColumn(index, -1)} aria-label="Move up">↑</button>
                    <button type="button" className="fin-btn" disabled={index === draft.layout.columns.length - 1} onClick={() => moveColumn(index, 1)} aria-label="Move down">↓</button>
                  </div>
                </div>
              ))}
            </div>

            <h4>Totals</h4>
            <div className="fin-form">
              <label className="fin-row__checkbox">
                <input type="checkbox" checked={draft.layout.computed.showSubtotal} onChange={(event) => patchLayout((layout) => ({ ...layout, computed: { ...layout.computed, showSubtotal: event.target.checked } }))} /> Subtotal
              </label>
              <label className="fin-row__checkbox">
                <input type="checkbox" checked={draft.layout.computed.showDiscount} onChange={(event) => patchLayout((layout) => ({ ...layout, computed: { ...layout.computed, showDiscount: event.target.checked } }))} /> Discount
              </label>
              <label className="fin-row__checkbox">
                <input type="checkbox" checked={draft.layout.computed.showTax} onChange={(event) => patchLayout((layout) => ({ ...layout, computed: { ...layout.computed, showTax: event.target.checked } }))} /> Tax
              </label>
              <label className="fin-row__checkbox">
                <input type="checkbox" checked={draft.layout.computed.showGrandTotal} onChange={(event) => patchLayout((layout) => ({ ...layout, computed: { ...layout.computed, showGrandTotal: event.target.checked } }))} /> Grand total
              </label>
            </div>

            <h4>Footer</h4>
            <div className="fin-form">
              <label className="is-wide">Note
                <textarea rows={2} value={draft.layout.footer.note} onChange={(event) => patchLayout((layout) => ({ ...layout, footer: { ...layout.footer, note: event.target.value } }))} />
              </label>
              <label className="fin-row__checkbox">
                <input type="checkbox" checked={draft.layout.footer.showSignature} onChange={(event) => patchLayout((layout) => ({ ...layout, footer: { ...layout.footer, showSignature: event.target.checked } }))} /> Show signature line
              </label>
            </div>

            <div className="fin-modal__actions">
              {!templates.find((record) => record.id === selectedId)?.isDefault && (
                <button type="button" className="fin-btn fin-btn--danger" disabled={deletingId === selectedId} onClick={() => {
                  const record = templates.find((candidate) => candidate.id === selectedId)
                  if (record) remove(record)
                }}>
                  {deletingId === selectedId ? 'Deleting…' : 'Delete'}
                </button>
              )}
              <button type="button" className="fin-btn" disabled={busy} onClick={duplicate}>Duplicate</button>
              {!templates.find((record) => record.id === selectedId)?.isDefault && (
                <button type="button" className="fin-btn" disabled={busy} onClick={setAsDefault}>Set as default</button>
              )}
              <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </>
        )}
      </div>

      <div className="fin-editor__preview"><iframe ref={previewRef} title="Template preview" /></div>
    </div>
  )
}
