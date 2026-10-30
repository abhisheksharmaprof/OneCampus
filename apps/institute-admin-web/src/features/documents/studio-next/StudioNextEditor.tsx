import React, { useEffect, useMemo, useState } from 'react'
import type { ElementV3, LayoutV3, ZoneV3, MasterLetterheadBindingV3, WatermarkV3 } from '@campusone/document-engine'
import type { DocumentTemplateRecord } from '../documents.api'
import type { InstituteBranding } from '../../finance/finance.api'
import { sampleDocumentData } from '../engine/datasets'
import { openPrintWindow, renderDocumentHtml } from '../engine/docRender'
import { createElementDefault } from './constants'
import { StudioTopBar } from './components/StudioTopBar'
import { StudioLeftRail } from './components/StudioLeftRail'
import { CanvasStage } from './canvas/CanvasStage'
import { StudioInspector } from './components/StudioInspector'
import { StudioStatusBar } from './components/StudioStatusBar'
import { ConflictModal } from './components/modals/ConflictModal'
import { MasterOverrideModal } from './components/modals/MasterOverrideModal'
import { useStudioNext } from './state/StudioNextContext'
import { exportLayoutJson, copyLayoutToClipboard } from './utils/exportJson'
import { handleStudioShortcuts } from './utils/shortcuts'
import { AdminApiError } from '../../admin/admin.api'
import './studioNext.css'

export interface StudioNextEditorProps {
  accessToken: string
  template: DocumentTemplateRecord
  branding: InstituteBranding | null
  masterLetterheads: DocumentTemplateRecord[]
  onBack: (saved: boolean) => void
  onSaveTemplate: (layout: LayoutV3, expectedRevision: number, name: string) => Promise<DocumentTemplateRecord>
  onReloadTemplate: () => Promise<DocumentTemplateRecord>
}

export function StudioNextEditor({
  accessToken,
  template,
  branding,
  masterLetterheads,
  onBack,
  onSaveTemplate,
  onReloadTemplate,
}: StudioNextEditorProps) {
  const { state, dispatch } = useStudioNext()
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [masterOverrideElementId, setMasterOverrideElementId] = useState<string | null>(null)

  // Show transient toast
  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3000)
  }

  // Active elements
  const currentPage = state.layout.pages[state.activePageIndex] ?? { elements: [] }
  const selectedElement =
    currentPage.elements.find((el) => state.selectedElementIds.includes(el.id)) ?? null

  // Bound Master Letterhead Name
  const masterLetterheadName = useMemo(() => {
    if (!state.layout.masterLetterhead?.templateId) return undefined
    const match = masterLetterheads.find((lh) => lh.id === state.layout.masterLetterhead?.templateId)
    return match?.name
  }, [state.layout.masterLetterhead?.templateId, masterLetterheads])

  // Sample data context
  const sampleData = useMemo(() => {
    const sample = sampleDocumentData(template.category)
    if (branding) {
      Object.assign(sample.tokens, {
        school_name: branding.name,
        school_address: [branding.addressLine1, branding.addressLine2, branding.city, branding.state, branding.postalCode].filter(Boolean).join(', '),
        school_phone: branding.primaryPhone ?? '',
        school_email: branding.primaryEmail ?? '',
        school_website: branding.websiteUrl ?? '',
        authorised_signatory: [branding.contactName, branding.contactDesignation].filter(Boolean).join(' · '),
      })
      sample.images['institute-logo'] = branding.logoUrl
    }
    return sample
  }, [template.category, branding])

  // Save handler
  const handleSave = async () => {
    dispatch({ type: 'SAVE_START' })
    try {
      const updated = await onSaveTemplate(state.layout, state.revision, state.templateName)
      dispatch({ type: 'SAVE_SUCCESS', newRevision: updated.revision ?? state.revision + 1 })
      showToast('Template saved successfully.')
    } catch (cause) {
      if (cause instanceof AdminApiError && (cause.code === 'STALE_TEMPLATE_REVISION' || cause.status === 409)) {
        const serverRev = (cause as any).data?.revision ?? state.revision + 1
        dispatch({
          type: 'SAVE_CONFLICT',
          serverRevision: serverRev,
          message: cause.message || 'Another user updated this template. Reload before saving.',
        })
      } else {
        dispatch({ type: 'SAVE_ERROR', error: cause instanceof Error ? cause.message : 'Save failed' })
        showToast(cause instanceof AdminApiError ? (cause.fieldErrors.layout?.[0] ?? cause.message) : 'Failed to save template.')
      }
    }
  }

  // Reload on Conflict
  const handleReloadConflict = async () => {
    try {
      const fresh = await onReloadTemplate()
      if (fresh.layout && (fresh.layout as any).version === 3) {
        dispatch({
          type: 'RESOLVE_CONFLICT_RELOAD',
          layout: fresh.layout as LayoutV3,
          revision: fresh.revision ?? 1,
        })
        showToast('Template reloaded to latest revision.')
      }
    } catch {
      showToast('Could not reload template from server.')
    }
  }

  // Print Preview
  const handlePreviewPrint = () => {
    try {
      const html = renderDocumentHtml({
        layout: state.layout,
        data: sampleData,
        mode: 'print',
        sampleMode: state.sampleMode,
      })
      if (!openPrintWindow(html)) {
        showToast('Print popup was blocked by browser. Please allow popups.')
      }
    } catch (e) {
      showToast('Failed to generate print preview.')
    }
  }

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleStudioShortcuts(event, state, dispatch, handleSave)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, dispatch])

  // Back confirmation
  const handleBack = () => {
    if (state.dirty && !window.confirm('You have unsaved changes. Leave Studio Next anyway?')) {
      return
    }
    onBack(!state.dirty)
  }

  // Element selection handler triggering master override modal if inherited
  const handleSelectElement = (id: string | null, multi?: boolean) => {
    dispatch({ type: 'SELECT_ELEMENT', id, multi })
    if (id) {
      const el = currentPage.elements.find((e) => e.id === id)
      if (el?.isInherited) {
        setMasterOverrideElementId(id)
      }
    }
  }

  // Merge field drag-and-drop onto canvas
  const handleDropToken = (tokenId: string, coordsMm: { xMm: number; yMm: number }) => {
    const hit = currentPage.elements.find(
      (el) =>
        el.type === 'text' &&
        coordsMm.xMm >= el.xMm &&
        coordsMm.xMm <= el.xMm + el.widthMm &&
        coordsMm.yMm >= el.yMm &&
        coordsMm.yMm <= el.yMm + el.heightMm,
    )

    if (hit) {
      const tokenSnippet = `{{${tokenId}}}`
      const newContent = hit.content ? `${hit.content} ${tokenSnippet}` : tokenSnippet
      dispatch({
        type: 'UPDATE_ELEMENT',
        id: hit.id,
        patch: { content: newContent },
      })
      dispatch({ type: 'SELECT_ELEMENT', id: hit.id })
      showToast(`Inserted {{${tokenId}}} into text element.`)
    } else {
      const el = createElementDefault('text', 'body')
      el.xMm = Math.max(0, Math.round(coordsMm.xMm))
      el.yMm = Math.max(0, Math.round(coordsMm.yMm))
      el.widthMm = 60
      el.heightMm = 10
      el.content = `{{${tokenId}}}`
      ;(el as any).runs = [
        {
          field: { id: tokenId },
          style: { bold: false, fontSizePt: 11, color: '#16212E' },
        },
      ]
      dispatch({ type: 'ADD_ELEMENT', element: el })
      dispatch({ type: 'SELECT_ELEMENT', id: el.id })
      showToast(`Created text element for {{${tokenId}}}.`)
    }
  }

  return (
    <div className="sn-workspace-root">
      {/* Zone 1: Top Bar */}
      <StudioTopBar
        templateName={state.templateName}
        category={state.category}
        revision={state.revision}
        isMasterLinked={Boolean(state.layout.masterLetterhead)}
        dirty={state.dirty}
        saving={state.saving}
        canUndo={state.historyIndex > 0}
        canRedo={state.historyIndex < state.history.length - 1}
        zoom={state.zoom}
        sampleMode={state.sampleMode}
        onBack={handleBack}
        onRename={(name) => dispatch({ type: 'SET_TEMPLATE_NAME', name })}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onZoomChange={(zoom) => dispatch({ type: 'SET_ZOOM', zoom })}
        onToggleSampleMode={(enabled) => dispatch({ type: 'SET_SAMPLE_MODE', enabled })}
        onExportJson={() => exportLayoutJson(state.layout, state.templateName)}
        onCopyJson={async () => {
          const ok = await copyLayoutToClipboard(state.layout)
          showToast(ok ? 'V3 Layout JSON copied to clipboard!' : 'Failed to copy to clipboard.')
        }}
        onPreviewPrint={handlePreviewPrint}
        onSave={handleSave}
      />

      {/* Main Body */}
      <div className="sn-body">
        {/* Zone 2: Left Rail */}
        <StudioLeftRail
          activeTab={state.activeLeftTab}
          onTabChange={(tab) => dispatch({ type: 'SET_ACTIVE_LEFT_TAB', tab })}
          elements={currentPage.elements}
          selectedElementIds={state.selectedElementIds}
          onAddElement={(el) => dispatch({ type: 'ADD_ELEMENT', element: el })}
          onInsertElements={(elements) => {
            elements.forEach((el) => dispatch({ type: 'ADD_ELEMENT', element: el }))
          }}
          onInsertFieldToken={(field) => {
            if (state.selectedElementIds.length === 1) {
              const selected = currentPage.elements.find((el) => el.id === state.selectedElementIds[0])
              if (selected && selected.type === 'text') {
                const tokenSnippet = `{{${field.id}}}`
                const updatedContent = selected.content ? `${selected.content} ${tokenSnippet}` : tokenSnippet
                dispatch({
                  type: 'UPDATE_ELEMENT',
                  id: selected.id,
                  patch: { content: updatedContent },
                })
                showToast(`Appended {{${field.id}}} to selected element.`)
                return
              }
            }
            const el = createElementDefault('text', 'body')
            el.content = `{{${field.id}}}`
            ;(el as any).runs = [
              {
                text: `${field.label}: `,
                style: { bold: true, fontSizePt: 10, color: '#16212E' },
              },
              {
                field: { id: field.id, fallback: field.fallback },
                style: { bold: false, fontSizePt: 10, color: '#16212E' },
              },
            ]
            dispatch({ type: 'ADD_ELEMENT', element: el })
            showToast(`Added {{${field.id}}}.`)
          }}
          onSelectElement={handleSelectElement}
          onToggleLock={(id) => dispatch({ type: 'TOGGLE_LOCK', id })}
          onToggleVisibility={(id) => dispatch({ type: 'TOGGLE_VISIBILITY', id })}
          onBringToFront={(id) => dispatch({ type: 'BRING_TO_FRONT', id })}
          onSendToBack={(id) => dispatch({ type: 'SEND_TO_BACK', id })}
          onStepUp={(id) => dispatch({ type: 'STEP_UP', id })}
          onStepDown={(id) => dispatch({ type: 'STEP_DOWN', id })}
          onDetachMaster={(id) => setMasterOverrideElementId(id)}
          onReassignZone={(id, zone) => dispatch({ type: 'REASSIGN_ZONE', id, zone })}
        />

        {/* Zone 3: Canvas Stage */}
        <CanvasStage
          layout={state.layout}
          activePageIndex={state.activePageIndex}
          zoom={state.zoom}
          selectedElementIds={state.selectedElementIds}
          hoveredElementId={state.hoveredElementId}
          smartGuides={state.smartGuides}
          cursorMm={state.cursorMm}
          sampleMode={state.sampleMode}
          sampleData={sampleData.tokens}
          assets={sampleData.images as Record<string, string>}
          onDropToken={handleDropToken}
          onSelectElement={handleSelectElement}
          onUpdateElementGeometry={(id, geom) => {
            if (geom.widthMm !== undefined && geom.heightMm !== undefined) {
              dispatch({
                type: 'RESIZE_ELEMENT_TRANSIENT',
                id,
                xMm: geom.xMm,
                yMm: geom.yMm,
                widthMm: geom.widthMm,
                heightMm: geom.heightMm,
              })
            } else if (geom.rotationDeg !== undefined) {
              dispatch({ type: 'ROTATE_ELEMENT_TRANSIENT', id, rotationDeg: geom.rotationDeg })
            } else {
              dispatch({ type: 'MOVE_ELEMENT_TRANSIENT', id, xMm: geom.xMm, yMm: geom.yMm })
            }
          }}
          onCommitGesture={() => dispatch({ type: 'COMMIT_HISTORY' })}
          onZoneResize={(zone, heightMm) => {
            dispatch({ type: 'UPDATE_ZONES', patch: { [zone]: heightMm } })
          }}
          onSetSmartGuides={(guides) => dispatch({ type: 'SET_SMART_GUIDES', guides })}
          onCursorMove={(coords) => dispatch({ type: 'SET_CURSOR_MM', coords })}
          onSetActivePage={(pageIndex) => dispatch({ type: 'SET_ACTIVE_PAGE', pageIndex })}
          onAddPage={() => dispatch({ type: 'ADD_PAGE' })}
          onDeletePage={(pageIndex) => dispatch({ type: 'DELETE_PAGE', pageIndex })}
        />

        {/* Zone 4: Right Inspector */}
        <StudioInspector
          layout={state.layout}
          activeTab={state.activeInspectorTab}
          selectedElement={selectedElement}
          masterLetterheads={masterLetterheads}
          onTabChange={(tab) => dispatch({ type: 'SET_ACTIVE_INSPECTOR_TAB', tab })}
          onUpdateElement={(id, patch) => dispatch({ type: 'UPDATE_ELEMENT', id, patch })}
          onReassignZone={(id, zone) => dispatch({ type: 'REASSIGN_ZONE', id, zone })}
          onDeleteElement={(id) => dispatch({ type: 'DELETE_SELECTED' })}
          onDuplicateElement={(id) => dispatch({ type: 'DUPLICATE_SELECTED' })}
          onToggleLock={(id) => dispatch({ type: 'TOGGLE_LOCK', id })}
          onUpdatePage={(patch) => dispatch({ type: 'UPDATE_PAGE_SETUP', patch })}
          onUpdateZones={(patch) => dispatch({ type: 'UPDATE_ZONES', patch })}
          onSetMasterLetterhead={(binding) => dispatch({ type: 'SET_MASTER_LETTERHEAD', binding })}
          onUpdateWatermark={(patch) => dispatch({ type: 'UPDATE_WATERMARK', patch })}
        />
      </div>

      {/* Zone 5: Bottom Status Bar */}
      <StudioStatusBar
        cursorMm={state.cursorMm}
        selectedElement={selectedElement}
        layout={state.layout}
        activePageIndex={state.activePageIndex}
        zoom={state.zoom}
        onZoomChange={(zoom) => dispatch({ type: 'SET_ZOOM', zoom })}
        onFitPage={() => dispatch({ type: 'SET_ZOOM', zoom: 0.85 })}
      />

      {/* HTTP 409 Concurrency Conflict Modal */}
      {state.saveConflict && (
        <ConflictModal
          serverRevision={state.saveConflict.serverRevision}
          message={state.saveConflict.message}
          onReloadLatest={handleReloadConflict}
          onCopyLocalJson={() => copyLayoutToClipboard(state.layout)}
          onDismiss={() => dispatch({ type: 'SAVE_ERROR', error: 'Conflict dismissed' })}
        />
      )}

      {/* Inherited Master Element Override Modal */}
      {masterOverrideElementId && (
        <MasterOverrideModal
          elementId={masterOverrideElementId}
          masterTemplateName={masterLetterheadName}
          onDetachLocally={(elementId) => {
            dispatch({ type: 'DETACH_MASTER_ELEMENT', id: elementId })
            setMasterOverrideElementId(null)
            showToast('Master element detached and converted to local element.')
          }}
          onDismiss={() => setMasterOverrideElementId(null)}
        />
      )}

      {/* Transient Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 48,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1E293B',
            color: '#FFFFFF',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
