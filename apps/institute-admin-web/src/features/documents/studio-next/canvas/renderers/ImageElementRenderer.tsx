import React from 'react'
import type { ImageElementV3 } from '@campusone/document-engine'
import { PX_PER_MM } from '../../constants'

export interface ImageElementRendererProps {
  element: ImageElementV3
  zoom: number
  assets?: Record<string, string>
}

export const ImageElementRenderer: React.FC<ImageElementRendererProps> = ({
  element,
  zoom,
  assets = {},
}) => {
  const scale = PX_PER_MM * zoom
  const assetId = element.assetId
  const src = (assetId && assets[assetId]) || element.src || (assetId?.startsWith('data:') ? assetId : '')

  const fit = element.fit === 'cover' ? 'cover' : element.fit === 'stretch' ? 'fill' : 'contain'
  const zoomScale = element.zoomScale ?? 1
  const panX = element.panOffset?.xPercent ?? 0
  const panY = element.panOffset?.yPercent ?? 0

  // Mask styles
  let maskStyle: React.CSSProperties = {}
  if (element.mask === 'circle') {
    maskStyle = {
      borderRadius: '50%',
      clipPath: 'circle(50% at 50% 50%)',
    }
  } else if (element.mask === 'rounded') {
    const rPx = (element.maskRadiusMm ?? 3) * scale
    maskStyle = {
      borderRadius: `${rPx}px`,
    }
  } else if (element.mask === 'hexagon') {
    maskStyle = {
      clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
    }
  }

  // Filter styles
  const filterParts: string[] = []
  const filters = element.filters
  if (filters?.grayscale !== undefined && filters.grayscale > 0) {
    filterParts.push(`grayscale(${filters.grayscale}%)`)
  }
  if (filters?.brightness !== undefined && filters.brightness !== 100) {
    filterParts.push(`brightness(${filters.brightness}%)`)
  }
  if (filters?.contrast !== undefined && filters.contrast !== 100) {
    filterParts.push(`contrast(${filters.contrast}%)`)
  }
  if (filters?.opacity !== undefined && filters.opacity < 100) {
    filterParts.push(`opacity(${filters.opacity}%)`)
  }
  const filterCss = filterParts.length > 0 ? filterParts.join(' ') : undefined

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: src ? 'transparent' : '#F8FAFC',
        border: src ? 'none' : '1px dashed #CBD5E1',
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...maskStyle,
      }}
    >
      {src ? (
        <img
          src={src}
          alt="Asset"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            transform: `scale(${zoomScale}) translate(${panX}%, ${panY}%)`,
            transformOrigin: 'center center',
            filter: filterCss,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <span style={{ fontSize: `${Math.max(10, 11 * zoom)}px`, color: '#64748B', fontWeight: 500 }}>
          Logo / Image
        </span>
      )}
    </div>
  )
}
