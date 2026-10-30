import React from 'react'
import type { WatermarkV3, WatermarkMode } from '@campusone/document-engine'

export interface WatermarkInspectorProps {
  watermark?: WatermarkV3
  onUpdateWatermark: (patch: Partial<WatermarkV3>) => void
}

export function WatermarkInspector({
  watermark,
  onUpdateWatermark,
}: WatermarkInspectorProps) {
  const current = watermark ?? { mode: 'none', opacity: 0.08, rotationDeg: -28, placement: 'pageCenter' }
  const isEnabled = current.mode !== 'none'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="sn-inspector-section">
        <div className="sn-section-header">Security Watermark</div>
        <div className="sn-field-col">
          <span className="sn-field-label">Watermark Type</span>
          <select
            className="sn-select"
            value={current.mode}
            onChange={(e) => onUpdateWatermark({ mode: e.target.value as WatermarkMode })}
          >
            <option value="none">Disabled (No watermark)</option>
            <option value="text">Diagonal Text</option>
            <option value="image">Institute Emblem / Seal</option>
            <option value="both">Both Text & Emblem</option>
          </select>
        </div>
      </div>

      {isEnabled && (
        <>
          {(current.mode === 'text' || current.mode === 'both') && (
            <div className="sn-inspector-section">
              <div className="sn-section-header">Watermark Text</div>
              <div className="sn-field-col">
                <span className="sn-field-label">Text string</span>
                <input
                  type="text"
                  className="sn-input"
                  value={current.text ?? ''}
                  placeholder="e.g. OFFICIAL / DUPLICATE / CONFIDENTIAL"
                  onChange={(e) => onUpdateWatermark({ text: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="sn-inspector-section">
            <div className="sn-section-header">Placement & Geometry</div>
            <div className="sn-field-col">
              <span className="sn-field-label">Placement</span>
              <select
                className="sn-select"
                value={current.placement ?? 'pageCenter'}
                onChange={(e) => onUpdateWatermark({ placement: e.target.value as any })}
              >
                <option value="pageCenter">Center of Page</option>
                <option value="bodyCenter">Center of Body Zone</option>
                <option value="tile">Repeated Tile Pattern</option>
                <option value="custom">Custom (X, Y)</option>
              </select>
            </div>

            <div className="sn-field-row" style={{ marginTop: 12 }}>
              <div className="sn-field-col">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="sn-field-label">Opacity</span>
                  <span className="sn-field-label">{Math.round((current.opacity ?? 0.08) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.02"
                  max="0.50"
                  step="0.01"
                  value={current.opacity ?? 0.08}
                  onChange={(e) => onUpdateWatermark({ opacity: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="sn-field-row">
              <div className="sn-field-col">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="sn-field-label">Rotation Angle</span>
                  <span className="sn-field-label">{current.rotationDeg ?? -28}°</span>
                </div>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  step="1"
                  value={current.rotationDeg ?? -28}
                  onChange={(e) => onUpdateWatermark({ rotationDeg: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>

            <div className="sn-field-row">
              <div className="sn-field-col">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="sn-field-label">Scale</span>
                  <span className="sn-field-label">{current.scalePercent ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="200"
                  step="5"
                  value={current.scalePercent ?? 100}
                  onChange={(e) => onUpdateWatermark({ scalePercent: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
