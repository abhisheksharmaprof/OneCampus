import React, { useState } from 'react'
import type { BorderV3, BorderStyleV3, BorderEdgeV3 } from '@campusone/document-engine'
import { ColorPicker } from './ColorPicker'

export interface BorderControlProps {
  border?: BorderV3
  flatWidthMm?: number
  flatColor?: string
  flatStyle?: BorderStyleV3
  disabled?: boolean
  onChange: (border: BorderV3, flatPatch: { borderWidthMm: number; borderColor: string; borderStyle: BorderStyleV3 }) => void
}

const BORDER_STYLES: BorderStyleV3[] = ['solid', 'dashed', 'dotted', 'double', 'none']

export const BorderControl: React.FC<BorderControlProps> = ({
  border,
  flatWidthMm = 0,
  flatColor = '#CBD5E1',
  flatStyle = 'solid',
  disabled,
  onChange,
}) => {
  const isUnified = border?.unified !== false

  // Fallback defaults
  const topEdge: BorderEdgeV3 = border?.top || {
    widthMm: flatWidthMm,
    color: flatColor,
    style: flatStyle,
  }
  const rightEdge: BorderEdgeV3 = border?.right || { ...topEdge }
  const bottomEdge: BorderEdgeV3 = border?.bottom || { ...topEdge }
  const leftEdge: BorderEdgeV3 = border?.left || { ...topEdge }

  const handleToggleUnified = () => {
    const nextUnified = !isUnified
    const newBorder: BorderV3 = {
      unified: nextUnified,
      top: { ...topEdge },
      right: nextUnified ? { ...topEdge } : { ...rightEdge },
      bottom: nextUnified ? { ...topEdge } : { ...bottomEdge },
      left: nextUnified ? { ...topEdge } : { ...leftEdge },
    }
    onChange(newBorder, {
      borderWidthMm: topEdge.widthMm,
      borderColor: topEdge.color,
      borderStyle: topEdge.style,
    })
  }

  const handleUpdateEdge = (edgeKey: 'top' | 'right' | 'bottom' | 'left', patch: Partial<BorderEdgeV3>) => {
    if (isUnified) {
      const updated: BorderEdgeV3 = { ...topEdge, ...patch }
      const newBorder: BorderV3 = {
        unified: true,
        top: updated,
        right: { ...updated },
        bottom: { ...updated },
        left: { ...updated },
      }
      onChange(newBorder, {
        borderWidthMm: updated.widthMm,
        borderColor: updated.color,
        borderStyle: updated.style,
      })
    } else {
      const current = edgeKey === 'top' ? topEdge : edgeKey === 'right' ? rightEdge : edgeKey === 'bottom' ? bottomEdge : leftEdge
      const updated: BorderEdgeV3 = { ...current, ...patch }
      const newBorder: BorderV3 = {
        unified: false,
        top: edgeKey === 'top' ? updated : topEdge,
        right: edgeKey === 'right' ? updated : rightEdge,
        bottom: edgeKey === 'bottom' ? updated : bottomEdge,
        left: edgeKey === 'left' ? updated : leftEdge,
      }
      onChange(newBorder, {
        borderWidthMm: newBorder.top?.widthMm ?? 0,
        borderColor: newBorder.top?.color ?? '#CBD5E1',
        borderStyle: newBorder.top?.style ?? 'solid',
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Unified toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sn-field-label">Border Configuration</span>
        <button
          type="button"
          className="sn-btn"
          disabled={disabled}
          onClick={handleToggleUnified}
          style={{ height: 22, padding: '0 6px', fontSize: 10 }}
        >
          {isUnified ? '🔗 Unified (All 4 Sides)' : '⚡ Independent (Per-Edge)'}
        </button>
      </div>

      {/* Unified Controls */}
      {isUnified ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Width (mm)</span>
              <input
                type="number"
                className="sn-input"
                disabled={disabled}
                min={0}
                max={20}
                step={0.5}
                value={topEdge.widthMm}
                onChange={(e) => handleUpdateEdge('top', { widthMm: Math.max(0, parseFloat(e.target.value) || 0) })}
                style={{ width: '100%', height: 28 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span className="sn-field-label">Style</span>
              <select
                className="sn-select"
                disabled={disabled}
                value={topEdge.style}
                onChange={(e) => handleUpdateEdge('top', { style: e.target.value as BorderStyleV3 })}
                style={{ width: '100%', height: 28, textTransform: 'capitalize' }}
              >
                {BORDER_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ColorPicker
            label="Border Color"
            disabled={disabled}
            value={topEdge.color}
            onChange={(c) => handleUpdateEdge('top', { color: c })}
          />
        </div>
      ) : (
        /* Independent 4 Edges */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
            const edge = side === 'top' ? topEdge : side === 'right' ? rightEdge : side === 'bottom' ? bottomEdge : leftEdge
            return (
              <div key={side} style={{ background: '#F8FAFC', padding: 6, borderRadius: 4, border: '1px solid #E2E8F0' }}>
                <span className="sn-field-label" style={{ textTransform: 'capitalize' }}>
                  {side} Edge
                </span>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input
                    type="number"
                    className="sn-input"
                    disabled={disabled}
                    min={0}
                    max={20}
                    step={0.5}
                    value={edge.widthMm}
                    onChange={(e) => handleUpdateEdge(side, { widthMm: Math.max(0, parseFloat(e.target.value) || 0) })}
                    style={{ width: 50, height: 26 }}
                    title="Width mm"
                  />
                  <select
                    className="sn-select"
                    disabled={disabled}
                    value={edge.style}
                    onChange={(e) => handleUpdateEdge(side, { style: e.target.value as BorderStyleV3 })}
                    style={{ flex: 1, height: 26, fontSize: 11 }}
                  >
                    {BORDER_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    type="color"
                    disabled={disabled}
                    value={edge.color.startsWith('#') ? edge.color.slice(0, 7) : '#000000'}
                    onChange={(e) => handleUpdateEdge(side, { color: e.target.value })}
                    style={{ width: 26, height: 26, padding: 0, border: 'none', cursor: 'pointer' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
