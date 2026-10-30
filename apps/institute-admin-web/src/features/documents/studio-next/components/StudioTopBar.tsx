import React from 'react'
import type { DocumentCategory } from '../types'
import { ZOOM_STEPS } from '../constants'

export interface StudioTopBarProps {
  templateName: string
  category: DocumentCategory
  revision: number
  isMasterLinked: boolean
  dirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  zoom: number
  sampleMode: boolean
  onBack: () => void
  onRename: (name: string) => void
  onUndo: () => void
  onRedo: () => void
  onZoomChange: (zoom: number) => void
  onToggleSampleMode: (enabled: boolean) => void
  onExportJson: () => void
  onCopyJson: () => void
  onPreviewPrint: () => void
  onSave: () => void
}

export function StudioTopBar({
  templateName,
  category,
  revision,
  isMasterLinked,
  dirty,
  saving,
  canUndo,
  canRedo,
  zoom,
  sampleMode,
  onBack,
  onRename,
  onUndo,
  onRedo,
  onZoomChange,
  onToggleSampleMode,
  onExportJson,
  onCopyJson,
  onPreviewPrint,
  onSave,
}: StudioTopBarProps) {
  return (
    <div className="sn-topbar">
      {/* Left: Back & Title */}
      <div className="sn-topbar-left">
        <button type="button" className="sn-btn" onClick={onBack}>
          ← Back
        </button>
        <input
          type="text"
          className="sn-title-input"
          value={templateName}
          onChange={(e) => onRename(e.target.value)}
          title="Click to rename template"
        />
        <span className="sn-badge">{category.replace('_', ' ')}</span>
        <span className="sn-badge" style={{ background: '#F1F5F9', color: '#475569' }}>
          Rev {revision}
        </span>
        {isMasterLinked && <span className="sn-badge sn-badge-master">Master Linked</span>}
      </div>

      {/* Center: History, Zoom, Sample Toggle */}
      <div className="sn-topbar-center">
        <button
          type="button"
          className="sn-btn"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z / Cmd+Z)"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          className="sn-btn"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Y / Cmd+Shift+Z)"
        >
          ↷ Redo
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <button
            type="button"
            className="sn-btn"
            style={{ padding: '0 8px' }}
            onClick={() => {
              const currentIdx = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.05)
              const prev = currentIdx > 0 ? ZOOM_STEPS[currentIdx - 1] : Math.max(0.25, zoom - 0.1)
              onZoomChange(Math.round(prev * 100) / 100)
            }}
          >
            −
          </button>
          <span style={{ fontSize: 12, minWidth: 42, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="sn-btn"
            style={{ padding: '0 8px' }}
            onClick={() => {
              const currentIdx = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.05)
              const next = currentIdx >= 0 && currentIdx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[currentIdx + 1] : Math.min(4.0, zoom + 0.1)
              onZoomChange(Math.round(next * 100) / 100)
            }}
          >
            +
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={sampleMode}
            onChange={(e) => onToggleSampleMode(e.target.checked)}
          />
          Sample Data
        </label>
      </div>

      {/* Right: Dirty Status, Export, Preview, Save */}
      <div className="sn-topbar-right">
        <div className="sn-dirty-indicator">
          <span className={`sn-dirty-dot ${dirty ? '' : 'saved'}`} />
          {dirty ? 'Unsaved' : 'Saved'}
        </div>

        <button type="button" className="sn-btn" onClick={onCopyJson} title="Copy V3 Layout JSON">
          Copy JSON
        </button>

        <button type="button" className="sn-btn" onClick={onExportJson} title="Download V3 JSON File">
          Export JSON
        </button>

        <button type="button" className="sn-btn" onClick={onPreviewPrint} title="Print or PDF Preview">
          Print Preview
        </button>

        <button
          type="button"
          className="sn-btn sn-btn-primary"
          disabled={saving || !dirty}
          onClick={onSave}
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  )
}
