import React from 'react'
import type { TextElementV3, TextStyleV3, TextAlign, TextVerticalAlign, TextTransform } from '@campusone/document-engine'
import { FontFamilySelect } from '../controls/FontFamilySelect'
import { FontSizeControl } from '../controls/FontSizeControl'
import { ColorPicker } from '../controls/ColorPicker'

export interface TextInspectorProps {
  element: TextElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<TextElementV3>) => void
}

export const TextInspector: React.FC<TextInspectorProps> = ({
  element,
  disabled,
  onUpdate,
}) => {
  const style = (element.style || {}) as TextStyleV3

  const updateStyle = (patch: Partial<TextStyleV3>) => {
    onUpdate({ style: { ...style, ...patch } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Content Textarea */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Text Content &amp; Tokens</div>
        <textarea
          className="sn-textarea"
          rows={3}
          disabled={disabled}
          value={element.content ?? ''}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="Enter text or tokens like {{student.full_name}}..."
          style={{ width: '100%', fontSize: 12, fontFamily: 'monospace' }}
        />
      </div>

      {/* Font Family & Size */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Typography</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span className="sn-field-label">Font Family</span>
            <FontFamilySelect
              value={style.fontFamily || 'Inter'}
              disabled={disabled}
              onChange={(f) => updateStyle({ fontFamily: f })}
            />
          </div>

          <div>
            <span className="sn-field-label">Font Size</span>
            <FontSizeControl
              fontSizePt={typeof style.fontSizePt === 'number' ? style.fontSizePt : 12}
              disabled={disabled}
              onChange={(sz) => updateStyle({ fontSizePt: sz })}
            />
          </div>

          {/* Style Toggles: Bold, Italic, Underline, Strikethrough */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={`sn-btn ${style.bold ? 'sn-btn-primary' : ''}`}
              disabled={disabled}
              onClick={() => updateStyle({ bold: !style.bold })}
              style={{ flex: 1, height: 28, fontWeight: 700 }}
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              className={`sn-btn ${style.italic ? 'sn-btn-primary' : ''}`}
              disabled={disabled}
              onClick={() => updateStyle({ italic: !style.italic })}
              style={{ flex: 1, height: 28, fontStyle: 'italic', fontWeight: 600 }}
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              className={`sn-btn ${style.underline ? 'sn-btn-primary' : ''}`}
              disabled={disabled}
              onClick={() => updateStyle({ underline: !style.underline })}
              style={{ flex: 1, height: 28, textDecoration: 'underline' }}
              title="Underline"
            >
              U
            </button>
            <button
              type="button"
              className={`sn-btn ${style.strikethrough ? 'sn-btn-primary' : ''}`}
              disabled={disabled}
              onClick={() => updateStyle({ strikethrough: !style.strikethrough })}
              style={{ flex: 1, height: 28, textDecoration: 'line-through' }}
              title="Strikethrough"
            >
              S
            </button>
          </div>

          {/* Horizontal Alignment */}
          <div>
            <span className="sn-field-label">Alignment</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`sn-btn ${style.align === a || (!style.align && a === 'left') ? 'sn-btn-primary' : ''}`}
                  disabled={disabled}
                  onClick={() => updateStyle({ align: a })}
                  style={{ flex: 1, height: 26, fontSize: 11, textTransform: 'capitalize' }}
                >
                  {a === 'left' ? '⬅ Left' : a === 'center' ? '⬌ Center' : a === 'right' ? '➡ Right' : '☰ Justify'}
                </button>
              ))}
            </div>
          </div>

          {/* Vertical Alignment */}
          <div>
            <span className="sn-field-label">Vertical Alignment</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['top', 'middle', 'bottom'] as const).map((va) => (
                <button
                  key={va}
                  type="button"
                  className={`sn-btn ${style.verticalAlign === va || (!style.verticalAlign && va === 'top') ? 'sn-btn-primary' : ''}`}
                  disabled={disabled}
                  onClick={() => updateStyle({ verticalAlign: va })}
                  style={{ flex: 1, height: 26, fontSize: 11, textTransform: 'capitalize' }}
                >
                  {va === 'top' ? '⬆ Top' : va === 'middle' ? '⬍ Middle' : '⬇ Bottom'}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics: Line Height & Letter Spacing */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Line Height</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={0.8}
                max={3.0}
                step={0.05}
                value={style.lineHeight ?? 1.25}
                onChange={(e) => updateStyle({ lineHeight: parseFloat(e.target.value) || 1.25 })}
                style={{ width: '100%', height: 28 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Letter Spacing (mm)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={-1}
                max={10}
                step={0.1}
                value={style.letterSpacingMm ?? 0}
                onChange={(e) => updateStyle({ letterSpacingMm: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', height: 28 }}
              />
            </div>
          </div>

          {/* Text Transform */}
          <div>
            <span className="sn-field-label">Text Transform</span>
            <select
              className="sn-select"
              disabled={disabled}
              value={style.textTransform || 'none'}
              onChange={(e) => updateStyle({ textTransform: e.target.value as TextTransform })}
              style={{ width: '100%', height: 28 }}
            >
              <option value="none">None (As typed)</option>
              <option value="uppercase">UPPERCASE</option>
              <option value="lowercase">lowercase</option>
              <option value="capitalize">Capitalize Words</option>
            </select>
          </div>

          {/* Text Color */}
          <ColorPicker
            label="Text Color"
            disabled={disabled}
            value={style.color || '#16212E'}
            onChange={(c) => updateStyle({ color: c })}
          />
        </div>
      </div>

      {/* Auto-Fit Settings */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Auto-Fit to Box (TS-11)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(style.autoFit)}
              onChange={(e) => updateStyle({ autoFit: e.target.checked })}
            />
            <span style={{ fontWeight: 600 }}>Enable Shrink-to-Fit</span>
          </label>

          {style.autoFit && (
            <div>
              <span className="sn-field-label">Minimum Font Size (pt)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={4}
                max={24}
                step={0.5}
                value={style.minFontSizePt ?? 6}
                onChange={(e) => updateStyle({ minFontSizePt: Math.max(4, parseFloat(e.target.value) || 6) })}
                style={{ width: '100%', height: 28 }}
              />
              <span style={{ fontSize: 10, color: '#64748B', marginTop: 4, display: 'block' }}>
                Text will automatically scale down if needed, but not below this size.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
