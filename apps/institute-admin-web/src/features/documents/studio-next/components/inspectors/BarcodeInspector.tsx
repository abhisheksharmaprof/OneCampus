import React from 'react'
import type { BarcodeElementV3, BarcodeSymbology } from '@campusone/document-engine'
import { ColorPicker } from '../controls/ColorPicker'

export interface BarcodeInspectorProps {
  element: BarcodeElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<BarcodeElementV3>) => void
}

export const BarcodeInspector: React.FC<BarcodeInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sn-inspector-section">
        <div className="sn-section-header">1D Barcode Symbology</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Symbology Standard</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['CODE128', 'CODE39'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={`sn-btn ${element.format === fmt || (!element.format && fmt === 'CODE128') ? 'sn-btn-primary' : ''}`}
                  disabled={disabled}
                  onClick={() => onUpdate({ format: fmt })}
                  style={{ flex: 1, height: 28, fontSize: 11 }}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="sn-field-label">Merge Field Key</span>
            <input
              type="text"
              className="sn-input"
              disabled={disabled}
              value={element.fieldId || ''}
              onChange={(e) => onUpdate({ fieldId: e.target.value })}
              placeholder="e.g. student.admission_no or receipt.number"
              style={{ width: '100%', height: 26, fontSize: 11, fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <span className="sn-field-label">Static Value (Fallback / Preview)</span>
            <input
              type="text"
              className="sn-input"
              disabled={disabled}
              value={element.staticValue || 'STU-2026-089'}
              onChange={(e) => onUpdate({ staticValue: e.target.value })}
              style={{ width: '100%', height: 26, fontSize: 11 }}
            />
          </div>
        </div>
      </div>

      <div className="sn-inspector-section">
        <div className="sn-section-header">Label &amp; Quiet Zone</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={element.showText !== false}
              onChange={(e) => onUpdate({ showText: e.target.checked })}
            />
            <span>Show Human-Readable Label</span>
          </label>

          {element.showText !== false && (
            <div>
              <span className="sn-field-label">Label Position</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['bottom', 'top'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`sn-btn ${element.textPosition === pos || (!element.textPosition && pos === 'bottom') ? 'sn-btn-primary' : ''}`}
                    disabled={disabled}
                    onClick={() => onUpdate({ textPosition: pos })}
                    style={{ flex: 1, height: 26, fontSize: 11, textTransform: 'capitalize' }}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Quiet Zone (mm)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={1}
                max={10}
                value={element.quietZoneMm ?? 2}
                onChange={(e) => onUpdate({ quietZoneMm: parseFloat(e.target.value) || 2 })}
                style={{ width: '100%', height: 26 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Bar Height (%)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={50}
                max={100}
                value={element.barHeightPercent ?? 80}
                onChange={(e) => onUpdate({ barHeightPercent: parseInt(e.target.value, 10) || 80 })}
                style={{ width: '100%', height: 26 }}
              />
            </div>
          </div>

          <ColorPicker
            label="Bar Color"
            disabled={disabled}
            value={element.color || '#000000'}
            onChange={(c) => onUpdate({ color: c })}
          />
        </div>
      </div>
    </div>
  )
}
