import React from 'react'
import type { CornerRadiiV3 } from '@campusone/document-engine'

export interface CornerRadiusControlProps {
  cornerRadii?: CornerRadiiV3
  flatRadiusMm?: number
  disabled?: boolean
  onChange: (cornerRadii: CornerRadiiV3, flatRadiusMm: number) => void
}

export const CornerRadiusControl: React.FC<CornerRadiusControlProps> = ({
  cornerRadii,
  flatRadiusMm = 0,
  disabled,
  onChange,
}) => {
  const isUnified = cornerRadii?.unified !== false

  const tl = cornerRadii?.topLeftMm ?? flatRadiusMm
  const tr = cornerRadii?.topRightMm ?? flatRadiusMm
  const br = cornerRadii?.bottomRightMm ?? flatRadiusMm
  const bl = cornerRadii?.bottomLeftMm ?? flatRadiusMm

  const handleToggleUnified = () => {
    const nextUnified = !isUnified
    const newRadii: CornerRadiiV3 = {
      unified: nextUnified,
      topLeftMm: tl,
      topRightMm: nextUnified ? tl : tr,
      bottomRightMm: nextUnified ? tl : br,
      bottomLeftMm: nextUnified ? tl : bl,
    }
    onChange(newRadii, tl)
  }

  const handleUpdate = (corner: 'topLeftMm' | 'topRightMm' | 'bottomRightMm' | 'bottomLeftMm', valMm: number) => {
    const safeVal = Math.max(0, Math.min(100, Math.round(valMm * 10) / 10))
    if (isUnified) {
      const newRadii: CornerRadiiV3 = {
        unified: true,
        topLeftMm: safeVal,
        topRightMm: safeVal,
        bottomRightMm: safeVal,
        bottomLeftMm: safeVal,
      }
      onChange(newRadii, safeVal)
    } else {
      const newRadii: CornerRadiiV3 = {
        unified: false,
        topLeftMm: corner === 'topLeftMm' ? safeVal : tl,
        topRightMm: corner === 'topRightMm' ? safeVal : tr,
        bottomRightMm: corner === 'bottomRightMm' ? safeVal : br,
        bottomLeftMm: corner === 'bottomLeftMm' ? safeVal : bl,
      }
      onChange(newRadii, newRadii.topLeftMm ?? 0)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sn-field-label">Corner Radius</span>
        <button
          type="button"
          className="sn-btn"
          disabled={disabled}
          onClick={handleToggleUnified}
          style={{ height: 22, padding: '0 6px', fontSize: 10 }}
        >
          {isUnified ? '🔗 Unified Corners' : '⚡ 4-Corners'}
        </button>
      </div>

      {isUnified ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            className="sn-input"
            disabled={disabled}
            min={0}
            max={100}
            step={0.5}
            value={tl}
            onChange={(e) => handleUpdate('topLeftMm', parseFloat(e.target.value) || 0)}
            style={{ width: 70, height: 28, textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: '#64748B' }}>mm (all corners)</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div>
            <span className="sn-field-label">Top-Left</span>
            <input
              type="number"
              className="sn-input"
              disabled={disabled}
              min={0}
              max={100}
              step={0.5}
              value={tl}
              onChange={(e) => handleUpdate('topLeftMm', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', height: 26 }}
            />
          </div>
          <div>
            <span className="sn-field-label">Top-Right</span>
            <input
              type="number"
              className="sn-input"
              disabled={disabled}
              min={0}
              max={100}
              step={0.5}
              value={tr}
              onChange={(e) => handleUpdate('topRightMm', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', height: 26 }}
            />
          </div>
          <div>
            <span className="sn-field-label">Bottom-Left</span>
            <input
              type="number"
              className="sn-input"
              disabled={disabled}
              min={0}
              max={100}
              step={0.5}
              value={bl}
              onChange={(e) => handleUpdate('bottomLeftMm', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', height: 26 }}
            />
          </div>
          <div>
            <span className="sn-field-label">Bottom-Right</span>
            <input
              type="number"
              className="sn-input"
              disabled={disabled}
              min={0}
              max={100}
              step={0.5}
              value={br}
              onChange={(e) => handleUpdate('bottomRightMm', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', height: 26 }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
