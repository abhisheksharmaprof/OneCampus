import React, { useState } from 'react'

export interface ColorPickerProps {
  label?: string
  value?: string
  disabled?: boolean
  allowTransparent?: boolean
  onChange: (color: string) => void
  onChangeTransient?: (color: string) => void
}

const PALETTE = [
  '#16212E', '#173A5E', '#0F172A',
  '#2563EB', '#137A4B', '#9A5B12', '#C0392B', '#7C4EA6',
  '#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1',
  '#FFFFFF',
]

export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value = '#000000',
  disabled,
  allowTransparent = true,
  onChange,
  onChangeTransient,
}) => {
  const isTransparent = value === 'transparent'
  const hexVal = isTransparent ? '#FFFFFF' : (value.startsWith('#') ? value.slice(0, 7) : '#000000')

  const handleSelect = (newColor: string) => {
    onChange(newColor)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span className="sn-field-label">{label}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Color input */}
        <div
          style={{
            position: 'relative',
            width: 28,
            height: 28,
            borderRadius: 4,
            border: '1px solid #CBD5E1',
            background: isTransparent
              ? 'repeating-conic-gradient(#E2E8F0 0% 25%, #FFFFFF 0% 50%) 50% / 8px 8px'
              : value,
            cursor: disabled ? 'default' : 'pointer',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <input
            type="color"
            disabled={disabled}
            value={hexVal}
            onChange={(e) => {
              if (onChangeTransient) onChangeTransient(e.target.value)
              else onChange(e.target.value)
            }}
            onBlur={(e) => onChange(e.target.value)}
            style={{
              position: 'absolute',
              top: -8,
              left: -8,
              width: 44,
              height: 44,
              opacity: 0,
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Text hex */}
        <input
          type="text"
          className="sn-input"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          style={{ flex: 1, height: 28, fontSize: 11, fontFamily: 'monospace' }}
        />

        {allowTransparent && (
          <button
            type="button"
            className={`sn-btn ${isTransparent ? 'sn-btn-primary' : ''}`}
            disabled={disabled}
            onClick={() => handleSelect('transparent')}
            style={{ height: 28, padding: '0 8px', fontSize: 11 }}
            title="Transparent"
          >
            None
          </button>
        )}
      </div>

      {/* Preset swatches */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(c)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: c,
              border: c === '#FFFFFF' ? '1px solid #CBD5E1' : '1px solid transparent',
              cursor: 'pointer',
              padding: 0,
              outline: value.toLowerCase() === c.toLowerCase() ? '2px solid #2563EB' : 'none',
              outlineOffset: 1,
            }}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}
