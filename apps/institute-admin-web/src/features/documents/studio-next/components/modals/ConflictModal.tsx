import React from 'react'

export interface ConflictModalProps {
  serverRevision: number
  message?: string
  onReloadLatest: () => void
  onCopyLocalJson: () => void
  onDismiss: () => void
}

export function ConflictModal({
  serverRevision,
  message,
  onReloadLatest,
  onCopyLocalJson,
  onDismiss,
}: ConflictModalProps) {
  return (
    <div className="sn-modal-overlay">
      <div className="sn-modal-dialog">
        <div className="sn-modal-header" style={{ color: '#DC2626' }}>
          ⚠️ Concurrency Conflict (Revision {serverRevision})
        </div>
        <div className="sn-modal-body">
          <p style={{ margin: 0, marginBottom: 12 }}>
            {message || 'This document template was updated in another session or tab.'}
          </p>
          <p style={{ margin: 0, color: '#64748B', fontSize: 12 }}>
            To prevent overwriting newer changes made by another administrator, you must reload the latest template version before saving. You can copy your current unsaved layout JSON to the clipboard before reloading.
          </p>
        </div>
        <div className="sn-modal-footer">
          <button type="button" className="sn-btn" onClick={onDismiss}>
            Review Canvas
          </button>
          <button type="button" className="sn-btn" onClick={onCopyLocalJson}>
            Copy My JSON
          </button>
          <button type="button" className="sn-btn sn-btn-primary" onClick={onReloadLatest}>
            Reload Latest Version
          </button>
        </div>
      </div>
    </div>
  )
}
