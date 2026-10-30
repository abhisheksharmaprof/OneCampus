import React, { useState } from 'react'
import type { ImageElementV3, ClippingMaskType, ImageFiltersV3 } from '@campusone/document-engine'
import { AssetManagerModal } from '../modals/AssetManagerModal'

export interface ImageInspectorProps {
  element: ImageElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<ImageElementV3>) => void
}

export const ImageInspector: React.FC<ImageInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const filters: ImageFiltersV3 = element.filters || {}

  const updateFilters = (patch: Partial<ImageFiltersV3>) => {
    onUpdate({ filters: { ...filters, ...patch } })
  }

  const pan = element.panOffset || { xPercent: 0, yPercent: 0 }
  const zoom = element.zoomScale ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Asset Source */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Image Asset</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="sn-btn sn-btn-primary"
            disabled={disabled}
            onClick={() => setAssetModalOpen(true)}
            style={{ height: 30, fontSize: 12 }}
          >
            🖼️ Browse Asset Manager...
          </button>

          <div>
            <span className="sn-field-label">Direct Image URL / Data URL</span>
            <input
              type="text"
              className="sn-input"
              disabled={disabled}
              value={element.src || element.assetId || ''}
              onChange={(e) => onUpdate({ src: e.target.value, assetId: e.target.value })}
              placeholder="https://... or data:image/..."
              style={{ width: '100%', height: 26, fontSize: 11 }}
            />
          </div>
        </div>
      </div>

      {/* Fit, Pan & Zoom */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Framing &amp; Object Fit</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Object Fit</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['contain', 'cover', 'stretch'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`sn-btn ${element.fit === f || (!element.fit && f === 'contain') ? 'sn-btn-primary' : ''}`}
                  disabled={disabled}
                  onClick={() => onUpdate({ fit: f })}
                  style={{ flex: 1, height: 26, fontSize: 11, textTransform: 'capitalize' }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="sn-field-label">Zoom Scale</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={300}
              disabled={disabled}
              value={Math.round(zoom * 100)}
              onChange={(e) => onUpdate({ zoomScale: parseInt(e.target.value, 10) / 100 })}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Pan X (%)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={-50}
                max={50}
                value={pan.xPercent}
                onChange={(e) => onUpdate({ panOffset: { ...pan, xPercent: parseInt(e.target.value, 10) || 0 } })}
                style={{ width: '100%', height: 26 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Pan Y (%)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={-50}
                max={50}
                value={pan.yPercent}
                onChange={(e) => onUpdate({ panOffset: { ...pan, yPercent: parseInt(e.target.value, 10) || 0 } })}
                style={{ width: '100%', height: 26 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Clipping Masks */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Clipping Mask</div>
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

          {element.mask === 'rounded' && (
            <div>
              <span className="sn-field-label">Corner Radius (mm)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={1}
                max={50}
                step={0.5}
                value={element.maskRadiusMm ?? 3}
                onChange={(e) => onUpdate({ maskRadiusMm: parseFloat(e.target.value) || 3 })}
                style={{ width: 80, height: 26 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Image Filters */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Filters &amp; Adjustments</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="sn-field-label">Grayscale</span>
              <span style={{ fontSize: 11 }}>{filters.grayscale ?? 0}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              disabled={disabled}
              value={filters.grayscale ?? 0}
              onChange={(e) => updateFilters({ grayscale: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="sn-field-label">Brightness</span>
              <span style={{ fontSize: 11 }}>{filters.brightness ?? 100}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              disabled={disabled}
              value={filters.brightness ?? 100}
              onChange={(e) => updateFilters({ brightness: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="sn-field-label">Contrast</span>
              <span style={{ fontSize: 11 }}>{filters.contrast ?? 100}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              disabled={disabled}
              value={filters.contrast ?? 100}
              onChange={(e) => updateFilters({ contrast: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Asset Manager Modal */}
      <AssetManagerModal
        isOpen={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        onSelectAsset={(asset) => {
          onUpdate({ assetId: asset.id, src: asset.src })
        }}
      />
    </div>
  )
}
