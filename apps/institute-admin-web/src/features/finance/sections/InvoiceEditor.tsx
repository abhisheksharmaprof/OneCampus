import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createInvoice, fetchInstituteBranding, listFeePlans, searchStudents,
  type Invoice, type InvoiceLineItem, type StudentOption,
} from '../finance.api'
import { AdminApiError } from '../../admin/admin.api'
import { listDocumentTemplates } from '../../documents/documents.api'
import { invoiceToDocumentData } from '../../documents/engine/datasets'
import { renderDocumentHtml } from '../../documents/engine/docRender'
import { printFinanceDocument } from '../../documents/engine/printDocument'
import { defaultLayout } from '../../documents/engine/types'
import { inDays, money, StatePanel, today, useAbortableLoad } from './shared'

type InvoiceEditorProps = {
  accessToken: string
  onClose: (created: boolean) => void
}

const emptyItem = (): InvoiceLineItem => ({ description: '', period: '', qty: 1, amount: '0.00' })

function studentLabel(student: StudentOption | null): string {
  if (!student) return ''
  return [student.firstName, student.lastName].filter(Boolean).join(' ')
}

export default function InvoiceEditor({ accessToken, onClose }: InvoiceEditorProps) {
  const [studentQuery, setStudentQuery] = useState('')
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([])
  const [student, setStudent] = useState<StudentOption | null>(null)
  const [items, setItems] = useState<InvoiceLineItem[]>([emptyItem()])
  const [discount, setDiscount] = useState('0.00')
  const [tax, setTax] = useState('0.00')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState(inDays(15))
  const [notes, setNotes] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  const branding = useAbortableLoad((signal) => fetchInstituteBranding(accessToken, signal), [accessToken])
  const templatesLoad = useAbortableLoad((signal) => listDocumentTemplates(accessToken, 'FEE_INVOICE', signal), [accessToken])
  const plansLoad = useAbortableLoad((signal) => listFeePlans(accessToken, false, signal), [accessToken])
  const templates = templatesLoad.data?.items ?? []
  const plans = plansLoad.data?.items ?? []

  useEffect(() => {
    if (templateId !== null) return
    const preferred = templates.find((template) => template.isDefault) ?? templates[0]
    if (preferred) setTemplateId(preferred.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run the default-selection logic when the template list itself changes.
  }, [templates])

  useEffect(() => {
    if (studentQuery.trim().length < 2) { setStudentOptions([]); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchStudents(accessToken, studentQuery.trim(), controller.signal)
        .then((page) => setStudentOptions(page.items))
        .catch(() => { if (!controller.signal.aborted) setStudentOptions([]) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [accessToken, studentQuery])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.amount || 0) * (item.qty || 1), 0),
    [items],
  )
  const total = Math.max(subtotal - Number(discount || 0) + Number(tax || 0), 0)
  const template = templates.find((candidate) => candidate.id === templateId) ?? null

  const previewHtml = useMemo(() => {
    if (!branding.data) return ''
    const draft: Invoice = {
      id: 'preview', invoiceNumber: '(assigned on save)',
      studentId: student?.id ?? '', studentName: studentLabel(student) || 'Select a student',
      admissionNumber: student?.admissionNumber ?? '', className: '',
      status: 'DRAFT', issueDate, dueDate,
      lineItems: items.filter((item) => item.description.trim()),
      subtotal: subtotal.toFixed(2), discountAmount: Number(discount || 0).toFixed(2),
      taxAmount: Number(tax || 0).toFixed(2), total: total.toFixed(2),
      notes, templateId, totalPaid: '0.00',
    }
    const data = invoiceToDocumentData(draft, branding.data)
    return renderDocumentHtml({ layout: template?.layout ?? defaultLayout('A4P'), data, mode: 'preview' })
  }, [branding.data, student, items, subtotal, discount, tax, total, issueDate, dueDate, notes, template, templateId])

  // Debounced so a fast typist doesn't trigger a full iframe document.write() on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      previewRef.current?.contentDocument?.open()
      previewRef.current?.contentDocument?.write(previewHtml)
      previewRef.current?.contentDocument?.close()
    }, 200)
    return () => clearTimeout(timer)
  }, [previewHtml])

  const applyPlan = (planId: string) => {
    const plan = plans.find((candidate) => candidate.id === planId)
    if (!plan) return
    setItems(plan.items.map((item) => ({
      description: item.head,
      period: item.period,
      qty: 1,
      amount: Number(item.amount || 0).toFixed(2),
    })))
  }

  const updateItem = (index: number, patch: Partial<InvoiceLineItem>) =>
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)))

  const save = async (status: 'DRAFT' | 'ISSUED', printAfter: boolean) => {
    if (!student) { setError('Select a student first.'); return null }
    const lineItems = items
      .filter((item) => item.description.trim())
      .map((item) => ({ ...item, amount: Number(item.amount || 0).toFixed(2), qty: Math.max(Number(item.qty) || 1, 1) }))
    if (!lineItems.length) { setError('Add at least one line item.'); return null }
    setSaving(true)
    setError(null)
    try {
      const created = await createInvoice(accessToken, {
        studentId: student.id, issueDate, dueDate, lineItems,
        discountAmount: Number(discount || 0).toFixed(2), taxAmount: Number(tax || 0).toFixed(2),
        notes, templateId, status,
      })
      if (printAfter && branding.data) {
        const printed = await printFinanceDocument({ invoice: created, branding: branding.data, template })
        if (!printed) setError('The invoice was saved, but the print popup was blocked by the browser.')
      }
      return created
    } catch (cause) {
      setError(cause instanceof AdminApiError
        ? (cause.fieldErrors.studentId?.[0]
            ?? cause.fieldErrors.issueDate?.[0]
            ?? cause.fieldErrors.dueDate?.[0]
            ?? cause.fieldErrors.discountAmount?.[0]
            ?? cause.fieldErrors.lineItems?.[0]
            ?? cause.message)
        : 'The invoice could not be saved.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const saveAnd = (status: 'DRAFT' | 'ISSUED', printAfter: boolean, reset: boolean) => {
    void save(status, printAfter).then((created) => {
      if (!created) return
      if (reset) { setStudent(null); setStudentQuery(''); setItems([emptyItem()]); setNotes('') }
      else onClose(true)
    })
  }

  const editorLoading = branding.loading || templatesLoad.loading || plansLoad.loading
  const editorError = branding.error ?? templatesLoad.error ?? plansLoad.error
  const reloadEditorData = () => { branding.reload(); templatesLoad.reload(); plansLoad.reload() }

  if (editorLoading || editorError) {
    return (
      <div className="fin-card">
        <StatePanel loading={editorLoading} error={editorError} onRetry={reloadEditorData}>
          <></>
        </StatePanel>
      </div>
    )
  }

  return (
    <div className="fin-editor">
      <div className="fin-card">
        <h3>New invoice</h3>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        <div className="fin-form">
          <label className="is-wide">Student
            {student ? (
              <span>{studentLabel(student)} ({student.admissionNumber}) <button type="button" className="fin-btn" onClick={() => setStudent(null)}>Change</button></span>
            ) : (
              <>
                <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Search by name or admission number" />
                {studentOptions.map((option) => (
                  <button key={option.id} type="button" className="fin-btn" onClick={() => { setStudent(option); setStudentOptions([]) }}>
                    {studentLabel(option)} · {option.admissionNumber}
                  </button>
                ))}
              </>
            )}
          </label>
          <label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
          <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label>Fee plan (fills line items)
            <select defaultValue="" onChange={(event) => applyPlan(event.target.value)}>
              <option value="">— pick a plan —</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label>Template
            <select value={templateId ?? ''} onChange={(event) => setTemplateId(event.target.value || null)}>
              {templates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
        </div>
        <h4>Line items</h4>
        <div className="fin-rows">
          {items.map((item, index) => (
            <div className="fin-row" key={index}>
              <input value={item.description} placeholder="Description" onChange={(event) => updateItem(index, { description: event.target.value })} />
              <input value={item.period} placeholder="Period" onChange={(event) => updateItem(index, { period: event.target.value })} />
              <input type="number" min={1} value={item.qty} onChange={(event) => updateItem(index, { qty: Math.max(Number(event.target.value) || 1, 1) })} />
              <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} />
              <button type="button" className="fin-btn fin-btn--danger" aria-label="Remove row" onClick={() => setItems((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="fin-btn" onClick={() => setItems((current) => [...current, emptyItem()])}>+ Add row</button>
        <div className="fin-form">
          <label>Discount (₹)<input type="number" min={0} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
          <label>Tax (₹)<input type="number" min={0} step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} /></label>
          <label className="is-wide">Notes<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        <p><b>Subtotal:</b> {money(subtotal)} · <b>Total:</b> {money(total)}</p>
        <div className="fin-modal__actions">
          <button type="button" className="fin-btn" disabled={saving} onClick={() => onClose(false)}>Close</button>
          <button type="button" className="fin-btn" disabled={saving} onClick={() => saveAnd('DRAFT', false, false)}>Save draft</button>
          <button type="button" className="fin-btn" disabled={saving} onClick={() => saveAnd('ISSUED', false, true)}>Save &amp; new</button>
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={() => saveAnd('ISSUED', true, false)}>Save &amp; print</button>
        </div>
      </div>
      <div className="fin-editor__preview"><iframe ref={previewRef} title="Invoice preview" /></div>
    </div>
  )
}
