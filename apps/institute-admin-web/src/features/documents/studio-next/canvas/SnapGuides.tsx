import React from 'react'
import type { SnapGuideLine } from '../types'
import { PX_PER_MM } from '../constants'

export interface SnapGuidesProps {
  guides: SnapGuideLine[]
  zoom: number
}

export function SnapGuides({ guides, zoom }: SnapGuidesProps) {
  if (!guides || guides.length === 0) return null
  const scale = PX_PER_MM * zoom

  return (
    <>
      {guides.map((guide, idx) => {
        if (guide.axis === 'x') {
          return (
            <div
              key={`${guide.axis}-${guide.positionMm}-${idx}`}
              className="sn-guide-line vertical"
              style={{ left: `${guide.positionMm * scale}px` }}
            />
          )
        }
        return (
          <div
            key={`${guide.axis}-${guide.positionMm}-${idx}`}
            className="sn-guide-line horizontal"
            style={{ top: `${guide.positionMm * scale}px` }}
          />
        )
      })}
    </>
  )
}
