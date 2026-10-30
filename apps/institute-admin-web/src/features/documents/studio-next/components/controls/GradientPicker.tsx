import React from 'react'
import type { FillV3, LinearGradientV3, RadialGradientV3, SolidFillV3, GradientStopV3 } from '@campusone/document-engine'
import { compileFillCss } from '@campusone/document-engine'

export interface GradientPickerProps {
  fill?: FillV3
  disabled?: boolean
  onChange: (fill: FillV3) => void
}

export const GradientPicker: React.FC<GradientPickerProps> = ({
  fill,
  disabled,
  onChange,
}) => {
  // Determine mode
  const mode = typeof fill === 'object' && fill !== null ? fill.type : 'solid'
  const previewCss = compileFillCss(fill, '#173A5E')

  const handleModeChange = (newMode: 'solid' | 'linear-gradient' | 'radial-gradient') => {
    if (newMode === 'solid') {
      const color = typeof fill === 'string' ? fill : typeof fill === 'object' && fill.type === 'solid' ? fill.color : '#173A5E'
      onChange({ type: 'solid', color })
    } else if (newMode === 'linear-gradient') {
      const stops: GradientStopV3[] = [
        { color: '#173A5E', offset: 0 },
        { color: '#2563EB', offset: 100 },
      ]
      onChange({ type: 'linear-gradient', angleDeg: 135, stops })
    } else if (newMode === 'radial-gradient') {
      const stops: GradientStopV3[] = [
        { color: '#2563EB', offset: 0 },
        { color: '#173A5E', offset: 100 },
      ]
      onChange({ type: 'radial-gradient', shape: 'circle', stops })
    }
  }

  const linear = mode === 'linear-gradient' ? (fill as LinearGradientV3) : null
  const radial = mode === 'radial-gradient' ? (fill as RadialGradientV3) : null
  const currentStops: GradientStopV3[] = linear?.stops || radial?.stops || [
    { color: '#173A5E', offset: 0 },
    { color: '#2563EB', offset: 100 },
  ]

  const updateStop = (index: number, patch: Partial<GradientStopV3>) => {
    const updated = currentStops.map((s, i) => (i === index ? { ...s, ...patch } : s))
    if (linear) {
      onChange({ ...linear, stops: updated })
    } else if (radial) {
      onChange({ ...radial, stops: updated })
    }
  }

  const addStop = () => {
    if (currentStops.length >= 5) return
    const newStop: GradientStopV3 = { color: '#38BDF8', offset: 50 }
    const updated = [...currentStops, newStop].sort((a, b) => a.offset - b.offset)
    if (linear) onChange({ ...linear, stops: updated })
    else if (radial) onChange({ ...radial, stops: updated })
  }

  const removeStop = (index: number) => {
    if (currentStops.length <= 2) return
    const updated = currentStops.filter((_, i) => i !== index)
    if (linear) onChange({ ...linear, stops: updated })
    else if (radial) onChange({ ...radial, stops: updated })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Mode Switcher */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          className={`sn-btn ${mode === 'solid' ? 'sn-btn-primary' : ''}`}
          disabled={disabled}
          onClick={() => handleModeChange('solid')}
          style={{ flex: 1, height: 26, fontSize: 11 }}
        >
          Solid
        </button>
        <button
          type="button"
          className={`sn-btn ${mode === 'linear-gradient' ? 'sn-btn-primary' : ''}`}
          disabled={disabled}
          onClick={() => handleModeChange('linear-gradient')}
          style={{ flex: 1, height: 26, fontSize: 11 }}
        >
          Linear
        </button>
        <button
          type="button"
          className={`sn-btn ${mode === 'radial-gradient' ? 'sn-btn-primary' : ''}`}
          disabled={disabled}
          onClick={() => handleModeChange('radial-gradient')}
          style={{ flex: 1, height: 26, fontSize: 11 }}
        >
          Radial
        </button>
      </div>

      {/* Preview Bar */}
      <div
        style={{
          width: '100%',
          height: 24,
          borderRadius: 4,
          border: '1px solid #CBD5E1',
          background: previewCss,
        }}
      />

      {/* Solid Color Picker */}
      {mode === 'solid' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            disabled={disabled}
            value={typeof fill === 'string' ? fill : (fill as SolidFillV3)?.color || '#173A5E'}
            onChange={(e) => onChange({ type: 'solid', color: e.target.value })}
            style={{ width: 32, height: 28, cursor: 'pointer', padding: 0, border: 'none' }}
          />
          <input
            type="text"
            className="sn-input"
            disabled={disabled}
            value={typeof fill === 'string' ? fill : (fill as SolidFillV3)?.color || '#173A5E'}
            onChange={(e) => onChange({ type: 'solid', color: e.target.value })}
            style={{ flex: 1, height: 28, fontSize: 11, fontFamily: 'monospace' }}
          />
        </div>
      )}

      {/* Linear Angle */}
      {linear && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sn-field-label">Gradient Angle</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{linear.angleDeg ?? 135}°</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 90, 135, 180].map((deg) => (
              <button
                key={deg}
                type="button"
                className={`sn-btn ${linear.angleDeg === deg ? 'sn-btn-primary' : ''}`}
                disabled={disabled}
                onClick={() => onChange({ ...linear, angleDeg: deg })}
                style={{ flex: 1, height: 24, fontSize: 10, padding: 0 }}
              >
                {deg}°
              </button>
            ))}
            <input
              type="number"
              className="sn-input"
              disabled={disabled}
              min={0}
              max={360}
              value={linear.angleDeg ?? 135}
              onChange={(e) => onChange({ ...linear, angleDeg: parseInt(e.target.value, 10) || 0 })}
              style={{ width: 48, height: 24, fontSize: 11, textAlign: 'center' }}
            />
          </div>
        </div>
      )}

      {/* Stops Controls */}
      {(mode === 'linear-gradient' || mode === 'radial-gradient') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sn-field-label">Color Stops ({currentStops.length})</span>
            {currentStops.length < 5 && (
              <button
                type="button"
                className="sn-btn"
                disabled={disabled}
                onClick={addStop}
                style={{ height: 20, padding: '0 6px', fontSize: 10 }}
              >
                + Add Stop
              </button>
            )}
          </div>

          {currentStops.map((stop, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="color"
                disabled={disabled}
                value={stop.color}
                onChange={(e) => updateStop(idx, { color: e.target.value })}
                style={{ width: 24, height: 24, cursor: 'pointer', padding: 0, border: 'none' }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={stop.offset}
                disabled={disabled}
                onChange={(e) => updateStop(idx, { offset: parseInt(e.target.value, 10) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, width: 32, textAlign: 'right' }}>{stop.offset}%</span>
              {currentStops.length > 2 && (
                <button
                  type="button"
                  className="sn-btn"
                  disabled={disabled}
                  onClick={() => removeStop(idx)}
                  style={{ width: 20, height: 20, padding: 0, fontSize: 10, color: '#EF4444' }}
                  title="Remove stop"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
