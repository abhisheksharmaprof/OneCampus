import React from 'react'
import type { LayoutV3 } from '@campusone/document-engine'
import { paginateDocument } from '@campusone/document-engine'
import { PAGE_SIZES_MM } from '../../engine/types'
import { LeftRuler, TopRuler } from './Rulers'
import { CanvasPage } from './CanvasPage'
import type { SnapGuideLine } from '../types'

export interface CanvasStageProps {
  layout: LayoutV3
  activePageIndex: number
  zoom: number
  selectedElementIds: string[]
  hoveredElementId: string | null
  smartGuides: SnapGuideLine[]
  cursorMm: { xMm: number; yMm: number } | null
  sampleMode: boolean
  sampleData?: Record<string, unknown>
  assets?: Record<string, string>
  onSelectElement: (id: string | null, multi?: boolean) => void
  onUpdateElementGeometry: (
    id: string,
    geometry: { xMm: number; yMm: number; widthMm?: number; heightMm?: number; rotationDeg?: number },
  ) => void
  onCommitGesture: () => void
  onZoneResize: (zone: 'headerMm' | 'footerMm', heightMm: number) => void
  onSetSmartGuides: (guides: SnapGuideLine[]) => void
  onCursorMove: (coords: { xMm: number; yMm: number } | null) => void
  onSetActivePage: (pageIndex: number) => void
  onAddPage: () => void
  onDeletePage: (pageIndex: number) => void
  onDropToken?: (tokenId: string, coordsMm: { xMm: number; yMm: number }) => void
}

export function CanvasStage({
  layout,
  activePageIndex,
  zoom,
  selectedElementIds,
  hoveredElementId,
  smartGuides,
  cursorMm,
  sampleMode,
  sampleData,
  assets,
  onSelectElement,
  onUpdateElementGeometry,
  onCommitGesture,
  onZoneResize,
  onSetSmartGuides,
  onCursorMove,
  onSetActivePage,
  onAddPage,
  onDeletePage,
  onDropToken,
}: CanvasStageProps) {
  const effectiveLayout = React.useMemo(() => {
    if (sampleMode) {
      try {
        const paginated = paginateDocument(layout, { fields: sampleData as any })
        return paginated.layout
      } catch {
        return layout
      }
    }
    return layout
  }, [layout, sampleMode, sampleData])

  const size = PAGE_SIZES_MM[effectiveLayout.page.sizeId]
  const isLandscape = effectiveLayout.page.orientation === 'LANDSCAPE'
  const pageWidthMm = isLandscape ? size.h : size.w
  const pageHeightMm = isLandscape ? size.w : size.h

  return (
    <div className="sn-canvas-viewport">
      {/* Rulers Container */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100%' }}>
        {/* Top Ruler Bar */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 25, background: '#F8FAFC' }}>
          <div className="sn-ruler-corner" />
          <TopRuler pageWidthMm={pageWidthMm} zoom={zoom} cursorMm={cursorMm} />
        </div>

        {/* Content area with Left Ruler & Canvas Pages */}
        <div style={{ display: 'flex', flex: 1 }}>
          <div className="sn-ruler-left">
            <LeftRuler pageHeightMm={pageHeightMm} zoom={zoom} cursorMm={cursorMm} />
          </div>

          <div className="sn-canvas-inner">
            {/* Multi-page tabs */}
            {effectiveLayout.pages.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                {effectiveLayout.pages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`sn-btn ${idx === activePageIndex ? 'sn-btn-primary' : ''}`}
                    onClick={() => onSetActivePage(idx)}
                  >
                    Page {idx + 1}
                  </button>
                ))}
                {!sampleMode && (
                  <button type="button" className="sn-btn" onClick={onAddPage}>
                    + Add Page
                  </button>
                )}
                {sampleMode && (
                  <span style={{ fontSize: 11, color: '#64748B', marginLeft: 4 }}>
                    ({effectiveLayout.pages.length} Pages Preview)
                  </span>
                )}
              </div>
            )}

            {/* Active Canvas Sheet */}
            <CanvasPage
              layout={effectiveLayout}
              pageIndex={Math.min(activePageIndex, effectiveLayout.pages.length - 1)}
              zoom={zoom}
              selectedElementIds={selectedElementIds}
              hoveredElementId={hoveredElementId}
              smartGuides={smartGuides}
              sampleMode={sampleMode}
              sampleData={sampleData}
              assets={assets}
              onSelectElement={onSelectElement}
              onUpdateElementGeometry={onUpdateElementGeometry}
              onCommitGesture={onCommitGesture}
              onZoneResize={onZoneResize}
              onSetSmartGuides={onSetSmartGuides}
              onCursorMove={onCursorMove}
              onDropToken={onDropToken}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
