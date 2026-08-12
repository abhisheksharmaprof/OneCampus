import { useEffect, useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import { fetchFinanceSettings, patchFinanceSettings, type FinanceSettings } from '../finance.api'
import { StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function SettingsSection({ accessToken }: FinanceSectionProps) {
  const settings = useAbortableLoad((signal) => fetchFinanceSettings(accessToken, signal), [accessToken])

  const [form, setForm] = useState<FinanceSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.data) setForm(settings.data)
  }, [settings.data])

  const update = (patch: Partial<FinanceSettings>) => {
    setForm((current) => (current ? { ...current, ...patch } : current))
    setSaved(false)
  }

  const submit = () => {
    if (!form) return
    setSaving(true)
    setError(null)
    patchFinanceSettings(accessToken, form)
      .then((result) => {
        setForm(result)
        setSaved(true)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof AdminApiError
          ? (cause.fieldErrors.invoicePrefix?.[0]
              ?? cause.fieldErrors.receiptPrefix?.[0]
              ?? cause.fieldErrors.taxPercent?.[0]
              ?? cause.fieldErrors.taxLabel?.[0]
              ?? cause.fieldErrors.invoiceFooter?.[0]
              ?? cause.fieldErrors.receiptFooter?.[0]
              ?? cause.message)
          : 'The settings could not be saved.')
      })
      .finally(() => setSaving(false))
  }

  return (
    <StatePanel loading={settings.loading} error={settings.error} onRetry={settings.reload} empty={!form}>
      {form && (
        <div className="fin-card">
          <h4>Finance settings</h4>
          {error && <p className="fin-field-error" role="alert">{error}</p>}
          {saved && !error && <p className="fin-hint">Saved.</p>}
          <div className="fin-form">
            <label>
              Invoice number prefix
              <input
                value={form.invoicePrefix}
                maxLength={10}
                onChange={(event) => update({ invoicePrefix: event.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Receipt number prefix
              <input
                value={form.receiptPrefix}
                maxLength={10}
                onChange={(event) => update({ receiptPrefix: event.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Tax label
              <input value={form.taxLabel} onChange={(event) => update({ taxLabel: event.target.value })} />
            </label>
            <label>
              Default tax %
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.taxPercent}
                onChange={(event) => update({ taxPercent: event.target.value })}
              />
            </label>
            <label className="is-wide">
              Invoice footer text
              <textarea
                rows={3}
                value={form.invoiceFooter}
                onChange={(event) => update({ invoiceFooter: event.target.value })}
              />
            </label>
            <label className="is-wide">
              Receipt footer text
              <textarea
                rows={3}
                value={form.receiptFooter}
                onChange={(event) => update({ receiptFooter: event.target.value })}
              />
            </label>
          </div>
          <div className="fin-modal__actions">
            <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </StatePanel>
  )
}
