import React from 'react'
import type { DividerElementV3, BorderStyleV3 } from '@campusone/document-engine'
import { ColorPicker } from '../controls/ColorPicker'

export interface DividerInspectorProps {
  element: DividerElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<DividerElementV3>) => void
}

export const DividerInspector: React.FC<DividerInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sn-inspector-section">
        <div className="sn-section-header">Divider Line</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Line Thickness (mm)</span>
            <input
              type="number"
              className="sn-input"
              disabled={disabled}
              min={0.1}
              max={20}
              step={0.5}
              value={element.thicknessMm ?? 1}
              onChange={(e) => onUpdate({ thicknessMm: Math.max(0.1, parseFloat(e.target.value) || 1) })}
              style={{ width: '100%', height: 28 }}
            />
          </div>

          <div>
            <span className="sn-field-label">Line Style</span>
            <select
              className="sn-select"
              disabled={disabled}
              value={element.lineStyle || 'solid'}
              onChange={(e) => onUpdate({ lineStyle: e.target.value as BorderStyleV3 })}
              style={{ width: '100%', height: 28, textTransform: 'capitalize' }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="double">Double</option>
            </select>
          </div>

          <ColorPicker
            label="Line Color"
            disabled={disabled}
            value={element.color || '#CBD5E1'}
            onChange={(c) => onUpdate({ color: c })}
          />
        </div>
      </div>

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
