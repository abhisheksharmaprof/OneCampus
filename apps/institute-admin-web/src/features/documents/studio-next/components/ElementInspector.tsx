import React from 'react'
import type { ElementV3, ZoneV3 } from '@campusone/document-engine'
import { TextInspector } from './inspectors/TextInspector'
import { ShapeInspector } from './inspectors/ShapeInspector'
import { DividerInspector } from './inspectors/DividerInspector'
import { ImageInspector } from './inspectors/ImageInspector'
import { PhotoInspector } from './inspectors/PhotoInspector'
import { BarcodeInspector } from './inspectors/BarcodeInspector'
import { QrInspector } from './inspectors/QrInspector'
import { TableInspector } from './inspectors/TableInspector'

export interface ElementInspectorProps {
  element: ElementV3 | null
  onUpdateElement: (id: string, patch: Partial<ElementV3>) => void
  onReassignZone: (id: string, zone: ZoneV3) => void
  onDeleteElement: (id: string) => void
  onDuplicateElement: (id: string) => void
  onToggleLock: (id: string) => void
}

export function ElementInspector({
  element,
  onUpdateElement,
  onReassignZone,
  onDeleteElement,
  onDuplicateElement,
  onToggleLock,
}: ElementInspectorProps) {
  if (!element) {
    return (
      <div style={{ textAlign: 'center', color: '#64748B', padding: '40px 16px' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>↖</div>
        <div style={{ fontWeight: 600 }}>No element selected</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Click an element on the canvas or layers tree to inspect and edit its properties.</div>
      </div>
    )
  }

  const isLocked = Boolean(element.locked)
  const isInherited = Boolean(element.isInherited)
  const elData = element as Record<string, unknown>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Title & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>
          {element.type} Element
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="sn-btn"
            style={{ padding: '0 8px', height: 26, fontSize: 11 }}
            title={isLocked ? 'Unlock' : 'Lock'}
            onClick={() => onToggleLock(element.id)}
          >
            {isLocked ? '🔒 Locked' : '🔓 Lock'}
          </button>
          {!isInherited && (
            <>
              <button
                type="button"
                className="sn-btn"
                style={{ padding: '0 8px', height: 26, fontSize: 11 }}
                title="Duplicate"
                onClick={() => onDuplicateElement(element.id)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="sn-btn"
                style={{ padding: '0 8px', height: 26, fontSize: 11, color: '#DC2626' }}
                title="Delete"
                onClick={() => onDeleteElement(element.id)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {isInherited && (
        <div style={{ background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#5B21B6' }}>
          <strong>Master Letterhead Element:</strong> This element is inherited from the institute letterhead. Detach it in the Layers tab to customize locally.
        </div>
      )}

      {/* Geometry Section */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Physical Geometry (mm)</div>
        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">X Pos (mm)</span>
            <input
              type="number"
              className="sn-input"
              disabled={isLocked || isInherited}
              value={element.xMm}
              onChange={(e) => onUpdateElement(element.id, { xMm: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Y Pos (mm)</span>
            <input
              type="number"
              className="sn-input"
              disabled={isLocked || isInherited}
              value={element.yMm}
              onChange={(e) => onUpdateElement(element.id, { yMm: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Width (mm)</span>
            <input
              type="number"
              className="sn-input"
              disabled={isLocked || isInherited}
              value={element.widthMm}
              onChange={(e) => onUpdateElement(element.id, { widthMm: Math.max(2, parseFloat(e.target.value) || 2) })}
            />
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Height (mm)</span>
            <input
              type="number"
              className="sn-input"
              disabled={isLocked || isInherited}
              value={element.heightMm}
              onChange={(e) => onUpdateElement(element.id, { heightMm: Math.max(1, parseFloat(e.target.value) || 1) })}
            />
          </div>
        </div>

        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Rotation (°)</span>
            <input
              type="number"
              className="sn-input"
              disabled={isLocked || isInherited}
              value={element.rotationDeg ?? 0}
              onChange={(e) => onUpdateElement(element.id, { rotationDeg: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Zone Layer</span>
            <select
              className="sn-select"
              disabled={isLocked || isInherited}
              value={element.zone ?? 'body'}
              onChange={(e) => onReassignZone(element.id, e.target.value as ZoneV3)}
            >
              <option value="header">Header</option>
              <option value="body">Body</option>
              <option value="footer">Footer</option>
            </select>
          </div>
        </div>

        {/* Flips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            className={`sn-btn ${elData.flipHorizontal ? 'sn-btn-primary' : ''}`}
            style={{ flex: 1, height: 26, fontSize: 11 }}
            disabled={isLocked || isInherited}
            onClick={() => onUpdateElement(element.id, { flipHorizontal: !elData.flipHorizontal } as any)}
          >
            Flip Horizontal
          </button>
          <button
            type="button"
            className={`sn-btn ${elData.flipVertical ? 'sn-btn-primary' : ''}`}
            style={{ flex: 1, height: 26, fontSize: 11 }}
            disabled={isLocked || isInherited}
            onClick={() => onUpdateElement(element.id, { flipVertical: !elData.flipVertical } as any)}
          >
            Flip Vertical
          </button>
        </div>
      </div>
      {/* Type Specific Specialized Inspectors */}
      {element.type === 'text' && (
        <TextInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'shape' && (
        <ShapeInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'divider' && (
        <DividerInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'image' && (
        <ImageInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'photo' && (
        <PhotoInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'barcode' && (
        <BarcodeInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'qr' && (
        <QrInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'table' && (
        <TableInspector
          element={element as any}
          disabled={isLocked || isInherited}
          onUpdate={(patch) => onUpdateElement(element.id, patch as any)}
        />
      )}

      {element.type === 'signature' && (
        <div className="sn-inspector-section">
          <div className="sn-section-header">Signature Properties</div>
          <div className="sn-field-col">
            <span className="sn-field-label">Signatory Label</span>
            <input
              type="text"
              className="sn-input"
              disabled={isLocked || isInherited}
              value={(elData.label as string) ?? ''}
              onChange={(e) => onUpdateElement(element.id, { label: e.target.value } as any)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
