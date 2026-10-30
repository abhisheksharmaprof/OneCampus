import { useEffect, useMemo, useReducer, useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import { fetchInstituteBranding, type InstituteBranding } from '../../finance/finance.api'
import { listDocumentTemplates, patchDocumentTemplate, type DocumentTemplateRecord } from '../documents.api'
import { sampleDocumentData } from '../engine/datasets'
import { openPrintWindow, renderDocumentHtml } from '../engine/docRender'
import { prepareQrDataUrls } from '../engine/qrPayload'
import { isLayoutV2 } from '../engine/types'
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
  const [mobilePanel, setMobilePanel] = useState<'components' | 'properties' | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)
  const [revision, setRevision] = useState(template.revision ?? 1)

  useEffect(() => {
    if (isLayoutV2(template.layout)) {
      dispatch({ type: 'load', layout: template.layout })
    }
  }, [template])

  const [branding, setBranding] = useState<InstituteBranding | null>(null)
  const [letterheads, setLetterheads] = useState<DocumentTemplateRecord[]>([])

  useEffect(() => {
    const controller = new AbortController()
    fetchInstituteBranding(accessToken, controller.signal)
      .then(setBranding)
      .catch(() => { /* sample values remain — branding is a nicety in the editor */ })
    return () => controller.abort()
  }, [accessToken])

  useEffect(() => {
    if (template.category === 'LETTERHEAD') return
    const controller = new AbortController()
    listDocumentTemplates(accessToken, 'LETTERHEAD', controller.signal)
      .then((result) => setLetterheads(result.items))
      .catch(() => setLetterheads([]))
    return () => controller.abort()
  }, [accessToken, template.category])

  const data = useMemo(() => {
    const sample = sampleDocumentData(template.category)
    if (branding) {
      const schoolAddress = [
        branding.addressLine1,
        branding.addressLine2,
        [branding.city, branding.state, branding.postalCode].filter(Boolean).join(' '),
        branding.country,
      ].filter(Boolean).join(', ')
      Object.assign(sample.tokens, {
        school_name: branding.name,
        school_address: schoolAddress,
        school_gstin: branding.gstNo ?? '',
        school_pan: branding.panNo ?? '',
        school_phone: branding.primaryPhone ?? '',
        school_email: branding.primaryEmail ?? '',
        school_website: branding.websiteUrl ?? '',
        authorised_signatory: [branding.contactName, branding.contactDesignation].filter(Boolean).join(' · '),
      })
      sample.images['institute-logo'] = branding.logoUrl
    }
    return sample
  }, [template.category, branding])

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const updated = await patchDocumentTemplate(accessToken, template.id, {
        layout: state.layout,
        expectedRevision: revision,
      })
      if (updated.revision) setRevision(updated.revision)
      dispatch({ type: 'markSaved' })
      setSavedOnce(true)
      setNotice('Saved.')
    } catch (cause) {
      if (cause instanceof AdminApiError && (cause.code === 'STALE_TEMPLATE_REVISION' || cause.status === 409)) {
        setNotice('Conflict: This template was updated elsewhere. Reload before saving.')
      } else {
        setNotice(cause instanceof AdminApiError
          ? (cause.fieldErrors.layout?.[0] ?? cause.message)
          : 'The template could not be saved.')
      }
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
        <button type="button" className="stu-btn stu-back-btn" onClick={leave}>← Back</button>
        <div className="stu-editor-title"><strong title={template.name}>{template.name}</strong>
        <span style={{ background: '#E8EEF5', color: '#173A5E', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
          {template.category.replace('_', ' ')}
        </span>
        </div>
        <div className="stu-editor-tools">
        {template.category !== 'LETTERHEAD' && <label className="stu-letterhead-select">Letterhead<select aria-label="Document letterhead" value={state.layout.letterhead?.templateId ?? ''} onChange={(event) => {
          const selected = letterheads.find((item) => item.id === event.target.value)
          const letterhead = selected && isLayoutV2(selected.layout)
            ? { templateId: selected.id, name: selected.name, elements: selected.layout.pages[0]?.elements ?? [] }
            : null
          dispatch({ type: 'setLetterhead', letterhead })
        }}>
          <option value="">No letterhead</option>
          {state.layout.letterhead && !letterheads.some((item) => item.id === state.layout.letterhead?.templateId) && <option value={state.layout.letterhead.templateId}>{state.layout.letterhead.name} (saved copy)</option>}
          {letterheads.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>{letterheads.length === 0 && <a href="/template-studio">Create a letterhead in Template Studio</a>}</label>}
        <button type="button" className="stu-btn" aria-label="Undo last change" onClick={() => dispatch({ type: 'undo' })} disabled={state.historyIndex <= 0}>↶ Undo</button>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'redo' })} disabled={state.historyIndex >= state.history.length - 1}>↷ Redo</button>
        <label className="stu-sample-toggle">
          <input type="checkbox" checked={state.sampleMode} onChange={(event) => dispatch({ type: 'setSampleMode', on: event.target.checked })} /> Sample data
        </label>
        <div className="stu-zoom-control" aria-label="Canvas zoom controls">
        <button type="button" className="stu-btn" aria-label="Zoom out" onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom - 0.1 })}>−</button>
        <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{Math.round(state.zoom * 100)}%</span>
        <button type="button" className="stu-btn" aria-label="Zoom in" onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom + 0.1 })}>+</button>
        </div>
        <button type="button" className="stu-btn stu-mobile-panel-toggle" aria-pressed={mobilePanel === 'components'} onClick={() => setMobilePanel((panel) => panel === 'components' ? null : 'components')}>Components</button>
        <button type="button" className="stu-btn stu-mobile-panel-toggle" aria-pressed={mobilePanel === 'properties'} onClick={() => setMobilePanel((panel) => panel === 'properties' ? null : 'properties')}>Properties</button>
        </div>
        <span className="spacer" />
        <span className={`stu-save-state ${state.dirty ? 'is-dirty' : ''}`} role={notice && notice !== 'Saved.' ? 'alert' : 'status'}>{notice ?? (state.dirty ? 'Unsaved changes' : 'All changes saved')}</span>
        <div className="stu-editor-actions">
        <button type="button" className="stu-btn" onClick={() => void previewPrint()}>Preview print</button>
        <button type="button" className="stu-btn stu-btn--primary" disabled={saving || !state.dirty} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save template'}
        </button>
        </div>
      </div>
      <div className="stu-workspace" data-mobile-panel={mobilePanel ?? 'canvas'}>
        <ComponentRail category={template.category} state={state} dispatch={dispatch} />
        <CanvasStage state={state} dispatch={dispatch} data={data} />
        <PropertiesPanel category={template.category} state={state} dispatch={dispatch} data={data} />
      </div>
    </div>
  )
}
