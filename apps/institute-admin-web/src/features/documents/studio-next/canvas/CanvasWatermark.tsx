import React from 'react'
import type { WatermarkV3 } from '@campusone/document-engine'
import { PX_PER_MM } from '../constants'

export interface CanvasWatermarkProps {
  watermark?: WatermarkV3
  pageWidthMm: number
  pageHeightMm: number
  headerMm: number
  footerMm: number
  zoom: number
  assetUrls?: Record<string, string>
}

export function CanvasWatermark({
  watermark,
  pageWidthMm,
  pageHeightMm,
  headerMm,
  footerMm,
  zoom,
  assetUrls = {},
}: CanvasWatermarkProps) {
  if (!watermark || watermark.mode === 'none') return null

  const scale = PX_PER_MM * zoom
  const opacity = Math.min(Math.max(watermark.opacity ?? 0.08, 0.02), 0.5)
  const rotation = watermark.rotationDeg ?? -28
  const scalePercent = (watermark.scalePercent ?? 100) / 100

  let centerYMm = pageHeightMm / 2
  if (watermark.placement === 'bodyCenter') {
    const bodyHeight = pageHeightMm - headerMm - footerMm
    centerYMm = headerMm + bodyHeight / 2
  } else if (watermark.placement === 'custom' && typeof watermark.yMm === 'number') {
    centerYMm = watermark.yMm
  }

  let centerXMm = pageWidthMm / 2
  if (watermark.placement === 'custom' && typeof watermark.xMm === 'number') {
    centerXMm = watermark.xMm
  }

  const isTile = watermark.placement === 'tile'

  if (isTile) {
    const gapX = (watermark.gapXmm ?? 60) * scale
    const gapY = (watermark.gapYmm ?? 40) * scale
    return (
      <div
        className="sn-watermark-tile-container"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 1,
          opacity,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, ${gapX}px)`,
          gridAutoRows: `${gapY}px`,
          alignItems: 'center',
          justifyItems: 'center',
        }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            style={{
              transform: `rotate(${rotation}deg) scale(${scalePercent})`,
              fontSize: `${18 * zoom}px`,
              fontWeight: 800,
              color: '#173A5E',
              whiteSpace: 'nowrap',
            }}
          >
            {watermark.text || 'CONFIDENTIAL'}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="sn-watermark-container"
      style={{
        position: 'absolute',
        left: `${centerXMm * scale}px`,
        top: `${centerYMm * scale}px`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scalePercent})`,
        pointerEvents: 'none',
        zIndex: 1,
        opacity,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {watermark.mode === 'text' || watermark.mode === 'both' ? (
        <span
          style={{
            fontSize: `${48 * zoom}px`,
            fontWeight: 800,
            color: '#173A5E',
            letterSpacing: '2px',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          {watermark.text || 'SAMPLE'}
        </span>
      ) : null}

      {(watermark.mode === 'image' || watermark.mode === 'both') && watermark.assetId ? (
        <img
          src={assetUrls[watermark.assetId] || watermark.assetId}
          alt="Watermark"
          style={{
            maxWidth: `${pageWidthMm * scale * 0.6}px`,
            maxHeight: `${pageHeightMm * scale * 0.4}px`,
            objectFit: 'contain',
          }}
        />
      ) : null}
    </div>
  )
}
