import React from 'react'
import type { ElementV3, LayoutV3 } from '@campusone/document-engine'
import { PAGE_SIZES_MM } from '../../engine/types'

export interface StudioStatusBarProps {
  cursorMm: { xMm: number; yMm: number } | null
  selectedElement: ElementV3 | null
  layout: LayoutV3
  activePageIndex: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onFitPage: () => void
}

export function StudioStatusBar({
  cursorMm,
  selectedElement,
  layout,
  activePageIndex,
  zoom,
  onZoomChange,
  onFitPage,
}: StudioStatusBarProps) {
  const size = PAGE_SIZES_MM[layout.page.sizeId]
  const isLandscape = layout.page.orientation === 'LANDSCAPE'
  const sheetW = isLandscape ? size.h : size.w
  const sheetH = isLandscape ? size.w : size.h
  const totalPages = layout.pages.length

  return (
    <div className="sn-statusbar">
      {/* Left: Cursor position */}
      <div className="sn-statusbar-left">
        <span>
          Cursor: {cursorMm ? `X: ${cursorMm.xMm} mm · Y: ${cursorMm.yMm} mm` : '—'}
        </span>
      </div>

      {/* Center: Selected Element metrics */}
      <div className="sn-statusbar-center">
        {selectedElement ? (
          <span>
            Selected: {selectedElement.widthMm} × {selectedElement.heightMm} mm [{selectedElement.zone ?? 'body'}]
            {selectedElement.locked ? ' (Locked)' : ''}
          </span>
        ) : (
          <span>No element selected</span>
        )}
      </div>

      {/* Right: Sheet size, page count, zoom controls */}
      <div className="sn-statusbar-right">
        <span>
          Sheet: {layout.page.sizeId} ({sheetW} × {sheetH} mm)
        </span>
        <span>
          Page {activePageIndex + 1} of {totalPages}
        </span>
        <button
          type="button"
          className="sn-btn"
          style={{ height: 20, fontSize: 10, padding: '0 6px' }}
          onClick={onFitPage}
        >
          Fit
        </button>
        <button
          type="button"
          className="sn-btn"
          style={{ height: 20, fontSize: 10, padding: '0 6px' }}
          onClick={() => onZoomChange(1.0)}
        >
          100%
        </button>
        <input
          type="range"
          min="0.25"
          max="3.0"
          step="0.05"
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          style={{ width: 80 }}
        />
      </div>
    </div>
  )
}
