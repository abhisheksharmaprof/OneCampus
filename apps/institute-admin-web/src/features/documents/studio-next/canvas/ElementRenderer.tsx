import React from 'react'
import type {
  ElementV3,
  TextElementV3,
  ShapeElementV3,
  DividerElementV3,
  ImageElementV3,
  PhotoElementV3,
  BarcodeElementV3,
  QrCodeElementV3,
} from '@campusone/document-engine'
import { PX_PER_MM } from '../constants'
import { computeFlipTransform } from '../math/handles'
import { TextElementRenderer } from './renderers/TextElementRenderer'
import { ShapeElementRenderer } from './renderers/ShapeElementRenderer'
import { DividerElementRenderer } from './renderers/DividerElementRenderer'
import { ImageElementRenderer } from './renderers/ImageElementRenderer'
import { PhotoFrameElementRenderer } from './renderers/PhotoFrameElementRenderer'
import { BarcodeElementRenderer } from './renderers/BarcodeElementRenderer'
import { TableElementRenderer } from './renderers/TableElementRenderer'
import type { TableElementV3 } from '@campusone/document-engine'

export interface ElementRendererProps {
  element: ElementV3
  absoluteYMm: number
  zoom: number
  isSelected: boolean
  isHovered: boolean
  sampleMode: boolean
  sampleData?: Record<string, unknown>
  assets?: Record<string, string>
  onSelect: (event: React.MouseEvent) => void
  onPointerDown: (event: React.PointerEvent) => void
}

export function ElementRenderer({
  element,
  absoluteYMm,
  zoom,
  isSelected,
  isHovered,
  sampleMode,
  sampleData = {},
  assets = {},
  onSelect,
  onPointerDown,
}: ElementRendererProps) {
  const scale = PX_PER_MM * zoom
  const leftPx = element.xMm * scale
  const topPx = absoluteYMm * scale
  const widthPx = element.widthMm * scale
  const heightPx = element.heightMm * scale
  const rotation = element.rotationDeg ?? 0

  const flipTransform = computeFlipTransform(
    {
      flipHorizontal: (element as Record<string, unknown>).flipHorizontal as boolean | undefined,
      flipVertical: (element as Record<string, unknown>).flipVertical as boolean | undefined,
    },
    rotation,
  )

  const isInherited = Boolean(element.isInherited)
  const isLocked = Boolean(element.locked)
  const isHidden = element.visible === false

  if (isHidden) return null

  // Render Inner Content by Type
  const renderContent = () => {
    switch (element.type) {
      case 'text':
        return (
          <TextElementRenderer
            element={element as TextElementV3}
            zoom={zoom}
            sampleMode={sampleMode}
            sampleData={sampleData}
          />
        )

      case 'image':
        return (
          <ImageElementRenderer
            element={element as ImageElementV3}
            zoom={zoom}
            assets={assets}
          />
        )

      case 'photo':
        return (
          <PhotoFrameElementRenderer
            element={element as PhotoElementV3}
            zoom={zoom}
            sampleMode={sampleMode}
            sampleData={sampleData}
            assets={assets}
          />
        )

      case 'signature': {
        const sigEl = element as Record<string, unknown>
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'center',
              textAlign: 'center',
              paddingBottom: `${2 * zoom}px`,
            }}
          >
            <div
              style={{
                width: '80%',
                height: '1px',
                background: '#16212E',
                marginBottom: `${4 * zoom}px`,
              }}
            />
            <span
              style={{
                fontSize: `${9 * zoom}px`,
                fontWeight: 600,
                color: '#16212E',
              }}
            >
              {(sigEl.label as string) || 'Authorized Signatory'}
            </span>
          </div>
        )
      }

      case 'table':
        return (
          <TableElementRenderer
            element={element as TableElementV3}
            zoom={zoom}
            sampleMode={sampleMode}
            sampleData={sampleData}
          />
        )

      case 'totals': {
        const totEl = element as Record<string, unknown>
        const rows = (totEl.rows as Array<{ label: string; bold?: boolean }>) ?? []
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: `${9 * zoom}px`,
              padding: `${4 * zoom}px`,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '4px',
            }}
          >
            {rows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: row.bold ? 700 : 400,
                }}
              >
                <span>{row.label}</span>
                <span>$0.00</span>
              </div>
            ))}
          </div>
        )
      }

      case 'shape':
        return <ShapeElementRenderer element={element as ShapeElementV3} zoom={zoom} />

      case 'divider':
        return <DividerElementRenderer element={element as DividerElementV3} zoom={zoom} />

      case 'pageFrame': {
        const frameEl = element as Record<string, unknown>
        const strokeW = Math.max(1, ((frameEl.strokeWidthMm as number) || 1.0) * scale)
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              border: `${strokeW}px solid ${(frameEl.strokeColor as string) || '#173A5E'}`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />
        )
      }

      case 'qr':
        return (
          <BarcodeElementRenderer
            element={element as QrCodeElementV3}
            zoom={zoom}
            sampleMode={sampleMode}
            sampleData={sampleData}
          />
        )

      case 'barcode':
        return (
          <BarcodeElementRenderer
            element={element as BarcodeElementV3}
            zoom={zoom}
            sampleMode={sampleMode}
            sampleData={sampleData}
          />
        )

      default:
        return null
    }
  }

  return (
    <div
      className={`sn-canvas-element ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isLocked ? 'locked' : ''}`}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        transform: flipTransform,
        transformOrigin: 'center center',
        zIndex: (element.zIndex as number) ?? 10,
        outline: isHovered && !isSelected ? '1px dashed #2563EB' : 'none',
        pointerEvents: isInherited ? 'none' : 'auto',
      }}
      onClick={onSelect}
      onPointerDown={onPointerDown}
    >
      {isInherited && (
        <span
          className="sn-badge sn-badge-master"
          style={{ position: 'absolute', top: -14, left: 0, zIndex: 100 }}
        >
          Master Letterhead
        </span>
      )}
      {renderContent()}
    </div>
  )
}
