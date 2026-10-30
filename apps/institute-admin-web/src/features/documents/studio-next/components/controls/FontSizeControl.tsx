import React from 'react'

export interface FontSizeControlProps {
  fontSizePt: number
  disabled?: boolean
  onChange: (fontSizePt: number) => void
}

const PRESET_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const MM_PER_PT = 25.4 / 72

export const FontSizeControl: React.FC<FontSizeControlProps> = ({
  fontSizePt = 12,
  disabled,
  onChange,
}) => {
  const [unit, setUnit] = React.useState<'pt' | 'mm'>('pt')

  const handleStep = (delta: number) => {
    let next: number
    if (fontSizePt <= 16) next = fontSizePt + delta * 1
    else if (fontSizePt <= 36) next = fontSizePt + delta * 2
    else next = fontSizePt + delta * 4
    onChange(Math.max(4, Math.min(144, Math.round(next * 10) / 10)))
  }

  const mmValue = Math.round(fontSizePt * MM_PER_PT * 100) / 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          className="sn-btn"
          disabled={disabled || fontSizePt <= 4}
          onClick={() => handleStep(-1)}
          style={{ width: 24, height: 28, padding: 0, fontWeight: 700 }}
          title="Decrease font size"
        >
          −
        </button>

        <input
          type="number"
          className="sn-input"
          disabled={disabled}
          min={unit === 'pt' ? 4 : 1.4}
          max={unit === 'pt' ? 144 : 50.8}
          step={unit === 'pt' ? 1 : 0.1}
          value={unit === 'pt' ? fontSizePt : mmValue}
          onChange={(e) => {
            const val = parseFloat(e.target.value) || 12
            if (unit === 'pt') {
              onChange(Math.max(4, Math.min(144, val)))
            } else {
              onChange(Math.max(4, Math.min(144, Math.round((val / MM_PER_PT) * 10) / 10)))
            }
          }}
          style={{ width: 54, height: 28, textAlign: 'center', fontSize: 12 }}
        />

        <button
          type="button"
          className="sn-btn"
          disabled={disabled || fontSizePt >= 144}
          onClick={() => handleStep(1)}
          style={{ width: 24, height: 28, padding: 0, fontWeight: 700 }}
          title="Increase font size"
        >
          +
        </button>

        <select
          className="sn-select"
          disabled={disabled}
          value={fontSizePt}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: 50, height: 28, fontSize: 11 }}
        >
          {PRESET_SIZES.map((pt) => (
            <option key={pt} value={pt}>
              {pt} pt
            </option>
          ))}
        </select>

        <button
          type="button"
          className="sn-btn"
          onClick={() => setUnit(unit === 'pt' ? 'mm' : 'pt')}
          style={{ height: 28, padding: '0 6px', fontSize: 11, fontWeight: 600 }}
          title="Toggle between Point (pt) and Millimeter (mm)"
        >
          {unit.toUpperCase()}
        </button>
      </div>

      <div style={{ fontSize: 10, color: '#64748B' }}>
        {unit === 'pt' ? `≈ ${mmValue} mm on physical page` : `≈ ${fontSizePt} pt typographic scale`}
      </div>
    </div>
  )
}
