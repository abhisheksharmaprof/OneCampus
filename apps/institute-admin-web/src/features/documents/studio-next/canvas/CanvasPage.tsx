import React, { useRef } from 'react'
import type { ElementV3, LayoutV3 } from '@campusone/document-engine'
import { PAGE_SIZES_MM } from '../../engine/types'
import { PX_PER_MM } from '../constants'
import { getElementAbsoluteYMm, pageToZoneY, zoneToPageY } from '../math/coordinates'
import { computeStudioSnap } from '../math/snap'
import { CanvasWatermark } from './CanvasWatermark'
import { CanvasZoneBands } from './CanvasZoneBands'
import { ElementRenderer } from './ElementRenderer'
import { SelectionBox } from './SelectionBox'
import { SnapGuides } from './SnapGuides'
import type { SnapGuideLine } from '../types'

export interface CanvasPageProps {
  layout: LayoutV3
  pageIndex: number
  zoom: number
  selectedElementIds: string[]
  hoveredElementId: string | null
  smartGuides: SnapGuideLine[]
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
  onDropToken?: (tokenId: string, coordsMm: { xMm: number; yMm: number }) => void
}

export function CanvasPage({
  layout,
  pageIndex,
  zoom,
  selectedElementIds,
  hoveredElementId,
  smartGuides,
  sampleMode,
  sampleData,
  assets,
  onSelectElement,
  onUpdateElementGeometry,
  onCommitGesture,
  onZoneResize,
  onSetSmartGuides,
  onCursorMove,
  onDropToken,
}: CanvasPageProps) {
  const scale = PX_PER_MM * zoom
  const size = PAGE_SIZES_MM[layout.page.sizeId]
  const isLandscape = layout.page.orientation === 'LANDSCAPE'
  const pageWidthMm = isLandscape ? size.h : size.w
  const pageHeightMm = isLandscape ? size.w : size.h

  const widthPx = pageWidthMm * scale
  const heightPx = pageHeightMm * scale

  const page = layout.pages[pageIndex] ?? { elements: [] }
  const elements = page.elements

  const activeElement = elements.find((el) => selectedElementIds.includes(el.id)) ?? null
  const activeAbsoluteYMm = activeElement ? getElementAbsoluteYMm(activeElement, layout) : 0

  const dragRef = useRef<{
    elementId: string
    startClientX: number
    startClientY: number
    startX: number
    startAbsY: number
    widthMm: number
    heightMm: number
    zone: string
  } | null>(null)

  const handlePointerDownElement = (el: ElementV3, event: React.PointerEvent) => {
    if (el.locked || el.isInherited) return
    event.stopPropagation()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

    const absY = getElementAbsoluteYMm(el, layout)
    dragRef.current = {
      elementId: el.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: el.xMm,
      startAbsY: absY,
      widthMm: el.widthMm,
      heightMm: el.heightMm,
      zone: el.zone ?? 'body',
    }
  }

  const handlePointerMovePage = (event: React.PointerEvent) => {
    const pageRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const cursorX = Math.round(((event.clientX - pageRect.left) / scale) * 10) / 10
    const cursorY = Math.round(((event.clientY - pageRect.top) / scale) * 10) / 10
    onCursorMove({ xMm: cursorX, yMm: cursorY })

    if (!dragRef.current) return
    const { elementId, startClientX, startClientY, startX, startAbsY, widthMm, heightMm, zone } = dragRef.current

    const rawDxMm = (event.clientX - startClientX) / scale
    const rawDyMm = (event.clientY - startClientY) / scale

    const targetX = startX + rawDxMm
    const targetAbsY = startAbsY + rawDyMm

    // Sibling bounding boxes for snapping
    const siblings = elements
      .filter((e) => e.id !== elementId && !e.locked)
      .map((e) => ({
        xMm: e.xMm,
        yMm: getElementAbsoluteYMm(e, layout),
        widthMm: e.widthMm,
        heightMm: e.heightMm,
      }))

    const snapResult = computeStudioSnap(
      { xMm: targetX, yMm: targetAbsY, widthMm, heightMm },
      siblings,
      {
        widthMm: pageWidthMm,
        heightMm: pageHeightMm,
        marginsMm: layout.page.marginsMm ?? { top: 10, right: 10, bottom: 10, left: 10 },
      },
      {
        headerMm: layout.zones.headerMm,
        footerMm: layout.zones.footerMm,
      },
    )

    onSetSmartGuides(snapResult.guides)

    // Convert snapped absolute Y back to zone-relative Y
    const newZoneY = pageToZoneY(
      zone as any,
      snapResult.yMm,
      layout.zones.headerMm,
      layout.zones.footerMm,
      pageHeightMm,
    )

    onUpdateElementGeometry(elementId, {
      xMm: snapResult.xMm,
      yMm: Math.round(newZoneY * 100) / 100,
    })
  }

  const handlePointerUpPage = (event: React.PointerEvent) => {
    if (dragRef.current) {
      dragRef.current = null
      onSetSmartGuides([])
      onCommitGesture()
    }
  }

  const bg = typeof layout.page.background === 'string' ? layout.page.background : '#FFFFFF'

  return (
    <div
      className="sn-page-sheet"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        background: bg,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSelectElement(null)
        }
      }}
      onPointerMove={handlePointerMovePage}
      onPointerUp={handlePointerUpPage}
      onPointerLeave={() => {
        onCursorMove(null)
        onSetSmartGuides([])
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-doc-token')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const tokenId = e.dataTransfer.getData('application/x-doc-token')
        if (tokenId && onDropToken) {
          e.preventDefault()
          const pageRect = e.currentTarget.getBoundingClientRect()
          const dropXMm = Math.round(((e.clientX - pageRect.left) / scale) * 10) / 10
          const dropYMm = Math.round(((e.clientY - pageRect.top) / scale) * 10) / 10
          onDropToken(tokenId, { xMm: dropXMm, yMm: dropYMm })
        }
      }}
    >
      {/* Stationery Zone visual bands */}
      <CanvasZoneBands
        pageHeightMm={pageHeightMm}
        headerMm={layout.zones.headerMm}
        footerMm={layout.zones.footerMm}
        zoom={zoom}
        onZoneResize={onZoneResize}
        onCommit={onCommitGesture}
      />

      {/* Watermark */}
      <CanvasWatermark
        watermark={layout.watermark}
        pageWidthMm={pageWidthMm}
        pageHeightMm={pageHeightMm}
        headerMm={layout.zones.headerMm}
        footerMm={layout.zones.footerMm}
        zoom={zoom}
        assetUrls={assets}
      />

      {/* Page Elements */}
      {elements.map((element) => {
        const absY = getElementAbsoluteYMm(element, layout)
        const isSelected = selectedElementIds.includes(element.id)
        const isHovered = hoveredElementId === element.id

        return (
          <ElementRenderer
            key={element.id}
            element={element}
            absoluteYMm={absY}
            zoom={zoom}
            isSelected={isSelected}
            isHovered={isHovered}
            sampleMode={sampleMode}
            sampleData={sampleData}
            assets={assets}
            onSelect={(e) => {
              e.stopPropagation()
              onSelectElement(element.id, e.shiftKey || e.metaKey || e.ctrlKey)
            }}
            onPointerDown={(e) => handlePointerDownElement(element, e)}
          />
        )
      })}

      {/* 8-Handle Selection & Transform Overlay */}
      {activeElement && !activeElement.isInherited && (
        <SelectionBox
          element={activeElement}
          absoluteYMm={activeAbsoluteYMm}
          zoom={zoom}
          lockAspectRatio={Boolean((activeElement as any).aspectRatioLocked || activeElement.type === 'photo')}
          onTransform={(patch) => {
            const newZoneY = pageToZoneY(
              activeElement.zone,
              patch.yMm,
              layout.zones.headerMm,
              layout.zones.footerMm,
              pageHeightMm,
            )
            onUpdateElementGeometry(activeElement.id, {
              xMm: patch.xMm,
              yMm: Math.round(newZoneY * 100) / 100,
              widthMm: patch.widthMm,
              heightMm: patch.heightMm,
            })
          }}
          onRotate={(deg) => {
            onUpdateElementGeometry(activeElement.id, {
              xMm: activeElement.xMm,
              yMm: activeElement.yMm,
              rotationDeg: deg,
            })
          }}
          onCommit={onCommitGesture}
        />
      )}

      {/* Alignment Smart Guides */}
      <SnapGuides guides={smartGuides} zoom={zoom} />
    </div>
  )
}
