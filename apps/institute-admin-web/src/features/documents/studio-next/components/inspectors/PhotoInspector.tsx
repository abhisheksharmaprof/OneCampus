import React from 'react'
import type { PhotoElementV3, PhotoAspectRatioPreset, ClippingMaskType, ImageFiltersV3 } from '@campusone/document-engine'
import { ColorPicker } from '../controls/ColorPicker'

export interface PhotoInspectorProps {
  element: PhotoElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<PhotoElementV3>) => void
}

const PRESET_DIMENSIONS: Record<PhotoAspectRatioPreset, { w: number; h: number; label: string }> = {
  CR80_25x30: { w: 25, h: 30, label: 'CR80 School ID (25×30 mm)' },
  PASSPORT_35x45: { w: 35, h: 45, label: 'Passport / Admit Card (35×45 mm)' },
  STAMP_20x25: { w: 20, h: 25, label: 'Stamp Size (20×25 mm)' },
  SQUARE_1x1: { w: 30, h: 30, label: 'Square (30×30 mm)' },
  CUSTOM: { w: 30, h: 36, label: 'Custom Dimension' },
}

export const PhotoInspector: React.FC<PhotoInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  const preset = element.aspectRatioPreset || 'CR80_25x30'

  const handlePresetSelect = (p: PhotoAspectRatioPreset) => {
    if (p === 'CUSTOM') {
      onUpdate({ aspectRatioPreset: 'CUSTOM' })
    } else {
      const dim = PRESET_DIMENSIONS[p]
      onUpdate({
        aspectRatioPreset: p,
        widthMm: dim.w,
        heightMm: dim.h,
        aspectRatioLocked: true,
      })
    }
  }

  const filters = element.filters || {}
  const updateFilters = (patch: Partial<ImageFiltersV3>) => {
    onUpdate({ filters: { ...filters, ...patch } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Aspect Ratio Presets */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Photo Frame Presets (TS-13)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            className="sn-select"
            disabled={disabled}
            value={preset}
            onChange={(e) => handlePresetSelect(e.target.value as PhotoAspectRatioPreset)}
            style={{ width: '100%', height: 28 }}
          >
            {(Object.keys(PRESET_DIMENSIONS) as PhotoAspectRatioPreset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_DIMENSIONS[p].label}
              </option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(element.aspectRatioLocked)}
              onChange={(e) => onUpdate({ aspectRatioLocked: e.target.checked })}
            />
            <span style={{ fontWeight: 600 }}>Lock Aspect Ratio during Resize</span>
          </label>
        </div>
      </div>

      {/* Data Binding & Fallback */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Student Data Binding</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Student Photo Data Key</span>
            <input
              type="text"
              className="sn-input"
              disabled={disabled}
              value={element.dataKey || 'student.photo_url'}
              onChange={(e) => onUpdate({ dataKey: e.target.value })}
              placeholder="student.photo_url"
              style={{ width: '100%', height: 26, fontSize: 11, fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <span className="sn-field-label">Fallback Avatar Initials / Badge</span>
            <input
              type="text"
              className="sn-input"
              disabled={disabled}
              maxLength={8}
              value={element.fallbackInitials || 'STUDENT'}
              onChange={(e) => onUpdate({ fallbackInitials: e.target.value })}
              placeholder="e.g. ST or STUDENT"
              style={{ width: '100%', height: 26, fontSize: 11 }}
            />
            <span style={{ fontSize: 10, color: '#64748B', marginTop: 2, display: 'block' }}>
              Displayed on the vector silhouette when student photo is missing.
            </span>
          </div>
        </div>
      </div>

      {/* Frame Border & Mask */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Frame Border &amp; Mask</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {(['square', 'rounded', 'circle', 'hexagon'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`sn-btn ${element.mask === m || (!element.mask && m === 'square') ? 'sn-btn-primary' : ''}`}
                disabled={disabled}
                onClick={() => onUpdate({ mask: m })}
                style={{ height: 26, fontSize: 10, textTransform: 'capitalize' }}
              >
                {m}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(element.showBorder)}
              onChange={(e) => onUpdate({ showBorder: e.target.checked })}
            />
            <span>Show Photo Border</span>
          </label>

          {element.showBorder && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <span className="sn-field-label">Border Width (mm)</span>
                <input
                  type="number"
                  className="sn-input"
                  disabled={disabled}
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={element.borderWidthMm ?? 1}
                  onChange={(e) => onUpdate({ borderWidthMm: parseFloat(e.target.value) || 1 })}
                  style={{ width: 80, height: 26 }}
                />
              </div>
              <ColorPicker
                label="Border Color"
                disabled={disabled}
                value={element.borderColor || '#CBD5E1'}
                onChange={(c) => onUpdate({ borderColor: c })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Grayscale filter for admit card photos */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Photo Adjustments</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="sn-field-label">Black &amp; White (Grayscale)</span>
          <button
            type="button"
            className={`sn-btn ${(filters.grayscale ?? 0) > 0 ? 'sn-btn-primary' : ''}`}
            disabled={disabled}
            onClick={() => updateFilters({ grayscale: (filters.grayscale ?? 0) > 0 ? 0 : 100 })}
            style={{ height: 24, padding: '0 8px', fontSize: 11 }}
          >
            {(filters.grayscale ?? 0) > 0 ? '✓ Grayscale On' : 'Grayscale Off'}
          </button>
        </div>
      </div>
    </div>
  )
}
