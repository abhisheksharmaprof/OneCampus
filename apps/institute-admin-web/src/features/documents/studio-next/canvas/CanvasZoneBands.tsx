import React, { useCallback, useRef } from 'react'
import { PX_PER_MM } from '../constants'

export interface CanvasZoneBandsProps {
  pageHeightMm: number
  headerMm: number
  footerMm: number
  zoom: number
  onZoneResize?: (zone: 'headerMm' | 'footerMm', newHeightMm: number) => void
  onCommit?: () => void
}

export function CanvasZoneBands({
  pageHeightMm,
  headerMm,
  footerMm,
  zoom,
  onZoneResize,
  onCommit,
}: CanvasZoneBandsProps) {
  const scale = PX_PER_MM * zoom
  const dragRef = useRef<{ zone: 'headerMm' | 'footerMm'; startClientY: number; startHeightMm: number } | null>(null)

  const handlePointerDown = (zone: 'headerMm' | 'footerMm', event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = {
      zone,
      startClientY: event.clientY,
      startHeightMm: zone === 'headerMm' ? headerMm : footerMm,
    }
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current || !onZoneResize) return
    const { zone, startClientY, startHeightMm } = dragRef.current
    const deltaYPx = event.clientY - startClientY
    const deltaYMm = deltaYPx / scale

    if (zone === 'headerMm') {
      const newHeight = Math.max(0, Math.min(pageHeightMm - footerMm - 10, startHeightMm + deltaYMm))
      onZoneResize('headerMm', Math.round(newHeight * 2) / 2)
    } else {
      // For footer, dragging downwards decreases footer height, dragging upwards increases footer height
      const newHeight = Math.max(0, Math.min(pageHeightMm - headerMm - 10, startHeightMm - deltaYMm))
      onZoneResize('footerMm', Math.round(newHeight * 2) / 2)
    }
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragRef.current) return
    ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)
    dragRef.current = null
    onCommit?.()
  }

  const headerPx = headerMm * scale
  const footerPx = footerMm * scale
  const pageHeightPx = pageHeightMm * scale

  return (
    <>
      {/* Header Band */}
      {headerMm > 0 && (
        <div
          className="sn-zone-band sn-zone-band-header"
          style={{ height: `${headerPx}px` }}
        />
      )}

      {/* Header Zone Divider Line */}
      <div
        className="sn-zone-divider"
        style={{ top: `${headerPx - 3}px` }}
        onPointerDown={(e) => handlePointerDown('headerMm', e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="sn-zone-pill">Header: {Math.round(headerMm)} mm</span>
      </div>

      {/* Footer Band */}
      {footerMm > 0 && (
        <div
          className="sn-zone-band sn-zone-band-footer"
          style={{ height: `${footerPx}px` }}
        />
      )}

      {/* Footer Zone Divider Line */}
      <div
        className="sn-zone-divider"
        style={{ top: `${pageHeightPx - footerPx - 3}px` }}
        onPointerDown={(e) => handlePointerDown('footerMm', e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="sn-zone-pill">Footer: {Math.round(footerMm)} mm</span>
      </div>
    </>
  )
}
