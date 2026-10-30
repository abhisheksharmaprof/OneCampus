import React from 'react'
import type { ShapeElementV3, FillV3, BorderV3, CornerRadiiV3 } from '@campusone/document-engine'
import { GradientPicker } from '../controls/GradientPicker'
import { BorderControl } from '../controls/BorderControl'
import { CornerRadiusControl } from '../controls/CornerRadiusControl'

export interface ShapeInspectorProps {
  element: ShapeElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<ShapeElementV3>) => void
}

export const ShapeInspector: React.FC<ShapeInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  const shapeType = element.shapeType || 'rectangle'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Shape Type */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Shape Geometry</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['rectangle', 'ellipse', 'pill'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={`sn-btn ${shapeType === st ? 'sn-btn-primary' : ''}`}
              disabled={disabled}
              onClick={() => onUpdate({ shapeType: st })}
              style={{ flex: 1, height: 28, fontSize: 11, textTransform: 'capitalize' }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Fill (Solid or Gradient) */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Background Fill</div>
        <GradientPicker
          fill={element.fill || element.fillColor}
          disabled={disabled}
          onChange={(newFill) => {
            const hexColor = typeof newFill === 'string'
              ? newFill
              : newFill.type === 'solid'
              ? newFill.color
              : '#173A5E'
            onUpdate({ fill: newFill, fillColor: hexColor })
          }}
        />
      </div>

      {/* Border Engine */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Stroke &amp; Borders</div>
        <BorderControl
          border={element.border}
          flatWidthMm={element.borderWidthMm}
          flatColor={element.borderColor}
          flatStyle={element.borderStyle}
          disabled={disabled}
          onChange={(newBorder, flatPatch) => {
            onUpdate({ border: newBorder, ...flatPatch })
          }}
        />
      </div>

      {/* Corner Radii (only applicable if shapeType is rectangle) */}
      {shapeType === 'rectangle' && (
        <div className="sn-inspector-section">
          <div className="sn-section-header">Corner Radii</div>
          <CornerRadiusControl
            cornerRadii={element.cornerRadii}
            flatRadiusMm={element.borderRadiusMm}
            disabled={disabled}
            onChange={(newRadii, flatR) => {
              onUpdate({ cornerRadii: newRadii, borderRadiusMm: flatR })
            }}
          />
        </div>
      )}

      {/* Opacity */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Opacity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            disabled={disabled}
            value={Math.round((element.opacity ?? 1) * 100)}
            onChange={(e) => onUpdate({ opacity: parseInt(e.target.value, 10) / 100 })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, width: 36, textAlign: 'right' }}>
            {Math.round((element.opacity ?? 1) * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}
