import { useState } from 'react'
import {
  createFeePlan, deleteFeePlan, listFeePlans, listGrades, patchFeePlan,
  type FeePlan, type FeePlanItem, type GradeOption,
} from '../finance.api'
import { AdminApiError } from '../../admin/admin.api'
import { money, StatePanel, useAbortableLoad, useModalKeyHandling, type FinanceSectionProps } from './shared'

const emptyItem = (): FeePlanItem => ({ head: '', amount: '0.00', period: '' })

function planTotal(items: FeePlanItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

export default function FeePlansSection({ accessToken, branchId }: FinanceSectionProps) {
  const [editing, setEditing] = useState<FeePlan | 'new' | null>(null)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const plans = useAbortableLoad((signal) => listFeePlans(accessToken, true, signal), [accessToken])
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])
  const gradeName = (id: string) => grades.data?.items.find((grade: GradeOption) => grade.id === id)?.name ?? id

  const removePlan = (plan: FeePlan) => {
    if (!window.confirm(
      `Delete fee plan "${plan.name}"? If it's already referenced by invoices, it will be deactivated instead of deleted.`,
    )) return
    setBusyMessage(null)
    setDeletingId(plan.id)
    deleteFeePlan(accessToken, plan.id)
      .then(() => plans.reload())
      .catch((cause: unknown) => setBusyMessage(cause instanceof AdminApiError ? cause.message : 'Delete failed.'))
      .finally(() => setDeletingId(null))
  }

  const items = plans.data?.items ?? []

  return (
    <>
      <div className="fin-toolbar">
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => setEditing('new')}>New fee plan</button>
      </div>
      {busyMessage && <p className="fin-field-error" role="alert">{busyMessage}</p>}
      <StatePanel loading={plans.loading || grades.loading} error={plans.error ?? grades.error} onRetry={() => { plans.reload(); grades.reload() }}
        empty={!items.length} emptyMessage="No fee plans yet — create your first fee plan.">
        <div className="fin-plans-grid">
          {items.map((plan) => (
            <div className="fin-card fin-plan-card" key={plan.id}>
              <div className="fin-plan-card__head">
                <h4>{plan.name}</h4>
                {!plan.isActive && <span className="fin-badge fin-badge--cancelled">Inactive</span>}
              </div>
              <p><small>{plan.academicYear}</small></p>
              <p>
                <small>
                  {plan.appliesTo.length ? plan.appliesTo.map(gradeName).join(', ') : 'No classes assigned'}
                </small>
              </p>
              <ul className="fin-plan-card__items">
                {plan.items.map((item, index) => (
                  <li key={index}>
                    <span>{item.head}{item.period ? ` (${item.period})` : ''}</span>
                    <span>{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="fin-plan-card__total"><b>Total: {money(planTotal(plan.items))}</b></p>
              <div className="fin-modal__actions">
                <button type="button" className="fin-btn" onClick={() => setEditing(plan)}>Edit</button>
                <button
                  type="button"
                  className="fin-btn fin-btn--danger"
                  disabled={deletingId === plan.id}
                  onClick={() => removePlan(plan)}
                >
                  {deletingId === plan.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </StatePanel>
      {editing && (
        <PlanEditorModal
          accessToken={accessToken}
          branchId={branchId}
          grades={grades.data?.items ?? []}
          plan={editing === 'new' ? null : editing}
          onClose={(saved) => { setEditing(null); if (saved) plans.reload() }}
        />
      )}
    </>
  )
}

function PlanEditorModal({ accessToken, branchId, grades, plan, onClose }: {
  accessToken: string
  branchId: string | undefined
  grades: GradeOption[]
  plan: FeePlan | null
  onClose: (saved: boolean) => void
}) {
  const [name, setName] = useState(plan?.name ?? '')
  const [academicYear, setAcademicYear] = useState(plan?.academicYear ?? '')
  const [classIds, setClassIds] = useState<string[]>(plan?.appliesTo ?? [])
  const [items, setItems] = useState<FeePlanItem[]>(plan?.items.length ? plan.items : [emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useModalKeyHandling(() => onClose(false))

  const updateItem = (index: number, patch: Partial<FeePlanItem>) =>
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)))

  const submit = () => {
    if (!name.trim()) { setError('Enter a plan name.'); return }
    if (!academicYear.trim()) { setError('Enter an academic year.'); return }
    const cleanItems = items
      .filter((item) => item.head.trim())
      .map((item) => ({ ...item, amount: Number(item.amount || 0).toFixed(2) }))
    if (!cleanItems.length) { setError('Add at least one fee-head item.'); return }
    setSaving(true)
    setError(null)
    const body = { name: name.trim(), academicYear: academicYear.trim(), appliesTo: classIds, items: cleanItems, branchId: branchId ?? null }
    const request = plan ? patchFeePlan(accessToken, plan.id, body) : createFeePlan(accessToken, body)
    request
      .then(() => onClose(true))
      .catch((cause: unknown) => {
        setError(cause instanceof AdminApiError
          ? (cause.fieldErrors.name?.[0]
              ?? cause.fieldErrors.academicYear?.[0]
              ?? cause.fieldErrors.appliesTo?.[0]
              ?? cause.fieldErrors.items?.[0]
              ?? cause.message)
          : 'The fee plan could not be saved.')
        setSaving(false)
      })
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>{plan ? 'Edit fee plan' : 'New fee plan'}</h3>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        <div className="fin-form">
          <label>Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Academic year<input value={academicYear} placeholder="e.g. 2026-27" onChange={(event) => setAcademicYear(event.target.value)} /></label>
          <label className="is-wide">Applicable classes
            <select multiple size={6} value={classIds} onChange={(event) => setClassIds(Array.from(event.target.selectedOptions, (option) => option.value))}>
              {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
            </select>
          </label>
        </div>
        <h4>Fee-head items</h4>
        <div className="fin-rows">
          {items.map((item, index) => (
            <div className="fin-row fin-row--plan" key={index}>
              <input value={item.head} placeholder="Fee head" onChange={(event) => updateItem(index, { head: event.target.value })} />
              <input value={item.period} placeholder="Period" onChange={(event) => updateItem(index, { period: event.target.value })} />
              <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} />
              <button type="button" className="fin-btn fin-btn--danger" aria-label="Remove row" onClick={() => setItems((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="fin-btn" onClick={() => setItems((current) => [...current, emptyItem()])}>+ Add row</button>
        <p><b>Total: {money(planTotal(items))}</b></p>
        <div className="fin-modal__actions">
          <button type="button" className="fin-btn" disabled={saving} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
