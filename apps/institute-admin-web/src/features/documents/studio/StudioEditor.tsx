import { useEffect, useMemo, useReducer, useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import { fetchInstituteBranding } from '../../finance/finance.api'
import { patchDocumentTemplate, type DocumentTemplateRecord } from '../documents.api'
import { sampleDocumentData } from '../engine/datasets'
import { openPrintWindow, renderDocumentHtml } from '../engine/docRender'
import { prepareQrDataUrls } from '../engine/qrPayload'
import { CanvasStage } from './CanvasStage'
import { ComponentRail } from './ComponentRail'
import { PropertiesPanel } from './PropertiesPanel'
import { editorReducer, initialEditorState } from './useEditorState'

interface StudioEditorProps {
  accessToken: string
  template: DocumentTemplateRecord
  onBack: (saved: boolean) => void
}

export function StudioEditor({ accessToken, template, onBack }: StudioEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)

  useEffect(() => { dispatch({ type: 'load', layout: template.layout }) }, [template])

  const [branding, setBranding] = useState<{ name: string; logoUrl: string | null } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchInstituteBranding(accessToken, controller.signal)
      .then((result) => setBranding({ name: result.name, logoUrl: result.logoUrl }))
      .catch(() => { /* sample values remain — branding is a nicety in the editor */ })
    return () => controller.abort()
  }, [accessToken])

  const data = useMemo(() => {
    const sample = sampleDocumentData(template.category)
    if (branding) {
      sample.tokens.school_name = branding.name
      sample.images['institute-logo'] = branding.logoUrl
    }
    return sample
  }, [template.category, branding])

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await patchDocumentTemplate(accessToken, template.id, { layout: state.layout })
      dispatch({ type: 'markSaved' })
      setSavedOnce(true)
      setNotice('Saved.')
    } catch (cause) {
      setNotice(cause instanceof AdminApiError
        ? (cause.fieldErrors.layout?.[0] ?? cause.message)
        : 'The template could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const previewPrint = async () => {
    setNotice(null)
    try {
      const qrDataUrls = await prepareQrDataUrls(state.layout, data)
      const html = renderDocumentHtml({
        layout: state.layout,
        data: { ...data, qrDataUrls },
        mode: 'print',
        sampleMode: true,
      })
      if (!openPrintWindow(html)) setNotice('The print popup was blocked by the browser.')
    } catch {
      setNotice('Preview failed — check the template for invalid values.')
    }
  }

  const leave = () => {
    if (state.dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
    onBack(savedOnce)
  }

  return (
    <div className="stu-root">
      <div className="stu-topbar">
        <strong>{template.name}</strong>
        <span style={{ background: '#E8EEF5', color: '#173A5E', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
          {template.category.replace('_', ' ')}
        </span>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'undo' })} disabled={state.historyIndex <= 0}>↶ Undo</button>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'redo' })} disabled={state.historyIndex >= state.history.length - 1}>↷ Redo</button>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={state.sampleMode} onChange={(event) => dispatch({ type: 'setSampleMode', on: event.target.checked })} /> Sample data
        </label>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom - 0.1 })}>−</button>
        <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{Math.round(state.zoom * 100)}%</span>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom + 0.1 })}>+</button>
        <span className="spacer" />
        {notice && <span role="alert" style={{ fontSize: 12, color: notice === 'Saved.' ? '#137A4B' : '#C0392B' }}>{notice}</span>}
        <button type="button" className="stu-btn" onClick={() => void previewPrint()}>Preview print</button>
        <button type="button" className="stu-btn stu-btn--primary" disabled={saving || !state.dirty} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save template'}
        </button>
        <button type="button" className="stu-btn" onClick={leave}>Back</button>
      </div>
      <div className="stu-workspace">
        <ComponentRail category={template.category} state={state} dispatch={dispatch} />
        <CanvasStage state={state} dispatch={dispatch} data={data} />
        <PropertiesPanel category={template.category} state={state} dispatch={dispatch} data={data} />
      </div>
    </div>
  )
}
