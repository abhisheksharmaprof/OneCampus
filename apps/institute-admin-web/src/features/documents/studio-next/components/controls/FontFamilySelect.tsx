import React from 'react'

export interface FontOption {
  family: string
  name: string
  category: 'sans-serif' | 'serif' | 'monospace' | 'display'
}

export const FONT_OPTIONS: FontOption[] = [
  // Sans-serif
  { family: 'Inter', name: 'Inter (Modern Sans)', category: 'sans-serif' },
  { family: 'Roboto', name: 'Roboto', category: 'sans-serif' },
  { family: 'Open Sans', name: 'Open Sans', category: 'sans-serif' },
  { family: 'Poppins', name: 'Poppins', category: 'sans-serif' },
  { family: 'Lato', name: 'Lato', category: 'sans-serif' },
  { family: 'Arial', name: 'Arial (Standard)', category: 'sans-serif' },
  // Serif
  { family: 'Merriweather', name: 'Merriweather (Book Serif)', category: 'serif' },
  { family: 'Playfair Display', name: 'Playfair Display (Editorial)', category: 'serif' },
  { family: 'Lora', name: 'Lora', category: 'serif' },
  { family: 'Times New Roman', name: 'Times New Roman', category: 'serif' },
  { family: 'Georgia', name: 'Georgia', category: 'serif' },
  // Monospace
  { family: 'JetBrains Mono', name: 'JetBrains Mono (Code)', category: 'monospace' },
  { family: 'Courier New', name: 'Courier New', category: 'monospace' },
  // Display
  { family: 'Cinzel', name: 'Cinzel (Formal / Certificates)', category: 'display' },
]

export interface FontFamilySelectProps {
  value: string
  disabled?: boolean
  onChange: (family: string) => void
}

export const FontFamilySelect: React.FC<FontFamilySelectProps> = ({
  value,
  disabled,
  onChange,
}) => {
  return (
    <select
      className="sn-select"
      disabled={disabled}
      value={value || 'Inter'}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontFamily: value || 'Inter', fontSize: 12, height: 28 }}
    >
      <optgroup label="Sans-Serif">
        {FONT_OPTIONS.filter((f) => f.category === 'sans-serif').map((f) => (
          <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
            {f.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Serif">
        {FONT_OPTIONS.filter((f) => f.category === 'serif').map((f) => (
          <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
            {f.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Monospace">
        {FONT_OPTIONS.filter((f) => f.category === 'monospace').map((f) => (
          <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
            {f.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Display / Certificate">
        {FONT_OPTIONS.filter((f) => f.category === 'display').map((f) => (
          <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
            {f.name}
          </option>
        ))}
      </optgroup>
    </select>
  )
}
