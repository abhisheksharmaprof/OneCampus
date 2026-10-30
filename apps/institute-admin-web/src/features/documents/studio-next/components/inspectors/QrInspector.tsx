import React from 'react'
import type { QrCodeElementV3, QrPayloadType, QrErrorCorrectionLevel } from '@campusone/document-engine'
import { ColorPicker } from '../controls/ColorPicker'

export interface QrInspectorProps {
  element: QrCodeElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<QrCodeElementV3>) => void
}

export const QrInspector: React.FC<QrInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  const payloadType = element.payloadType || 'verify-url'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sn-inspector-section">
        <div className="sn-section-header">QR Code Payload</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Payload Type</span>
            <select
              className="sn-select"
              disabled={disabled}
              value={payloadType}
              onChange={(e) => onUpdate({ payloadType: e.target.value as QrPayloadType })}
              style={{ width: '100%', height: 28 }}
            >
              <option value="verify-url">Document Verification URL</option>
              <option value="document-number">Serial / Document Number</option>
              <option value="custom-field">Bound Merge Field</option>
              <option value="static-text">Static Custom URL / Text</option>
            </select>
          </div>

          {payloadType === 'custom-field' && (
            <div>
              <span className="sn-field-label">Merge Field Key</span>
              <input
                type="text"
                className="sn-input"
                disabled={disabled}
                value={element.fieldId || ''}
                onChange={(e) => onUpdate({ fieldId: e.target.value })}
                placeholder="e.g. certificate.verification_url"
                style={{ width: '100%', height: 26, fontSize: 11, fontFamily: 'monospace' }}
              />
            </div>
          )}

          {payloadType === 'static-text' && (
            <div>
              <span className="sn-field-label">Static Content</span>
              <input
                type="text"
                className="sn-input"
                disabled={disabled}
                value={element.staticText || ''}
                onChange={(e) => onUpdate({ staticText: e.target.value })}
                placeholder="https://..."
                style={{ width: '100%', height: 26, fontSize: 11 }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="sn-inspector-section">
        <div className="sn-section-header">QR Configuration</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Error Correction Level</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['L', 'M', 'Q', 'H'] as const).map((ecc) => (
                <button
                  key={ecc}
                  type="button"
                  className={`sn-btn ${element.eccLevel === ecc || (!element.eccLevel && ecc === 'M') ? 'sn-btn-primary' : ''}`}
                  disabled={disabled}
                  onClick={() => onUpdate({ eccLevel: ecc })}
                  style={{ flex: 1, height: 26, fontSize: 11 }}
                  title={
                    ecc === 'L' ? 'Low (~7% recovery)' :
                    ecc === 'M' ? 'Medium (~15% recovery, recommended)' :
                    ecc === 'Q' ? 'Quartile (~25% recovery)' :
                    'High (~30% recovery, suitable for stamps)'
                  }
                >
                  {ecc}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="sn-field-label">Quiet Zone Modules</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2, 4].map((qz) => (
                <button
                  key={qz}
                  type="button"
                  className={`sn-btn ${element.quietZone === qz || (element.quietZone === undefined && qz === 1) ? 'sn-btn-primary' : ''}`}
                  disabled={disabled}
                  onClick={() => onUpdate({ quietZone: qz })}
                  style={{ flex: 1, height: 24, fontSize: 11 }}
                >
                  {qz} mod
                </button>
              ))}
            </div>
          </div>

          <ColorPicker
            label="Dark QR Color"
            disabled={disabled}
            value={element.darkColor || '#000000'}
            onChange={(c) => onUpdate({ darkColor: c })}
          />

          <ColorPicker
            label="Light Background Color"
            disabled={disabled}
            value={element.lightColor || '#FFFFFF'}
            onChange={(c) => onUpdate({ lightColor: c })}
          />
        </div>
      </div>
    </div>
  )
}
