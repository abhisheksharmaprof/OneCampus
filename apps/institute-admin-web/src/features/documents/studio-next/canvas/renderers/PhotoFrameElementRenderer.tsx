import React from 'react'
import type { PhotoElementV3 } from '@campusone/document-engine'
import { PX_PER_MM } from '../../constants'

export interface PhotoFrameElementRendererProps {
  element: PhotoElementV3
  zoom: number
  sampleMode: boolean
  sampleData?: Record<string, unknown>
  assets?: Record<string, string>
}

export const PhotoFrameElementRenderer: React.FC<PhotoFrameElementRendererProps> = ({
  element,
  zoom,
  sampleMode,
  sampleData = {},
  assets = {},
}) => {
  const scale = PX_PER_MM * zoom
  const dataKey = element.dataKey || 'student.photo_url'
  const rawSrc = sampleMode
    ? (sampleData[dataKey] as string)
      || (sampleData['student.photo_url'] as string)
      || (sampleData['student_photo'] as string)
      || (element.assetId ? assets[element.assetId] : '')
    : (element.assetId ? assets[element.assetId] : '')

  const fit = element.fit === 'contain' ? 'contain' : 'cover'

  // Mask
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

  // Border
  let borderStyle: React.CSSProperties = {}
  if (element.showBorder && element.borderWidthMm) {
    const bwPx = Math.max(1, element.borderWidthMm * scale)
    borderStyle = {
      border: `${bwPx}px solid ${element.borderColor || '#CBD5E1'}`,
    }
  }

  // Filters
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
  const filterCss = filterParts.length > 0 ? filterParts.join(' ') : undefined

  // Initials for avatar
  const initials = element.fallbackInitials
    || (sampleData['student.first_name'] as string)?.slice(0, 2)?.toUpperCase()
    || (sampleData['first_name'] as string)?.slice(0, 2)?.toUpperCase()
    || 'ST'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F1F5F9',
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...maskStyle,
        ...borderStyle,
      }}
    >
      {rawSrc ? (
        <img
          src={rawSrc}
          alt="Student Photo"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            filter: filterCss,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <svg
          viewBox="0 0 100 120"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          <rect width="100" height="120" fill="#F1F5F9" />
          <circle cx="50" cy="40" r="20" fill="#94A3B8" />
          <path d="M18 108 C18 80, 34 74, 50 74 C66 74, 82 80, 82 108 Z" fill="#94A3B8" />
          <rect x="20" y="96" width="60" height="18" rx="4" fill="#334155" opacity="0.9" />
          <text
            x="50"
            y="109"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#FFFFFF"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {initials}
          </text>
        </svg>
      )}
    </div>
  )
}
