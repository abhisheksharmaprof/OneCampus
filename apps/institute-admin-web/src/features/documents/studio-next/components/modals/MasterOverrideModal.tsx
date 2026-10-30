import React from 'react'

export interface MasterOverrideModalProps {
  elementId: string
  masterTemplateName?: string
  onDetachLocally: (elementId: string) => void
  onDismiss: () => void
}

export function MasterOverrideModal({
  elementId,
  masterTemplateName = 'Institute Master Letterhead',
  onDetachLocally,
  onDismiss,
}: MasterOverrideModalProps) {
  return (
    <div className="sn-modal-overlay">
      <div className="sn-modal-dialog">
        <div className="sn-modal-header" style={{ color: '#6D28D9' }}>
          🔗 Inherited Master Element
        </div>
        <div className="sn-modal-body">
          <p style={{ margin: 0, marginBottom: 12 }}>
            This element is defined centrally by <strong>{masterTemplateName}</strong> and locked to preserve brand consistency across all documents.
          </p>
          <p style={{ margin: 0, color: '#64748B', fontSize: 12 }}>
            Detaching this element copies it directly into this document template, allowing you to freely reposition, edit, or delete it locally without altering the shared master letterhead.
          </p>
        </div>
        <div className="sn-modal-footer">
          <button type="button" className="sn-btn" onClick={onDismiss}>
            Cancel
          </button>
          <button
            type="button"
            className="sn-btn sn-btn-primary"
            onClick={() => onDetachLocally(elementId)}
          >
            Detach & Customize Locally
          </button>
        </div>
      </div>
    </div>
  )
}
