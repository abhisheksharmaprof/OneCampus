import React from 'react'
import type { DividerElementV3 } from '@campusone/document-engine'
import { PX_PER_MM } from '../../constants'

export interface DividerElementRendererProps {
  element: DividerElementV3
  zoom: number
}

export const DividerElementRenderer: React.FC<DividerElementRendererProps> = ({
  element,
  zoom,
}) => {
  const scale = PX_PER_MM * zoom
  const color = element.color || '#CBD5E1'
  const thicknessPx = Math.max(1, (element.thicknessMm ?? 1) * scale)
  const lineStyle = element.lineStyle || 'solid'
  const isHorizontal = element.widthMm >= element.heightMm

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: element.opacity ?? 1,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: isHorizontal ? '100%' : '0px',
          height: isHorizontal ? '0px' : '100%',
          borderTop: isHorizontal ? `${thicknessPx}px ${lineStyle} ${color}` : 'none',
          borderLeft: !isHorizontal ? `${thicknessPx}px ${lineStyle} ${color}` : 'none',
        }}
      />
    </div>
  )
}
