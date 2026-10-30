import React, { useRef, useState } from 'react'
import type { ElementV3, ResizeHandleId } from '../types'
import { PX_PER_MM } from '../constants'
import { computeResizeTransform, computeRotationAngle } from '../math/handles'

export interface SelectionBoxProps {
  element: ElementV3
  absoluteYMm: number
  zoom: number
  lockAspectRatio?: boolean
  onTransform: (patch: { xMm: number; yMm: number; widthMm: number; heightMm: number }) => void
  onRotate: (rotationDeg: number) => void
  onCommit: () => void
}

const HANDLES: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function SelectionBox({
  element,
  absoluteYMm,
  zoom,
  lockAspectRatio = false,
  onTransform,
  onRotate,
  onCommit,
}: SelectionBoxProps) {
  const scale = PX_PER_MM * zoom
  const [activeRotatingAngle, setActiveRotatingAngle] = useState<number | null>(null)

  const resizeDragRef = useRef<{
    handle: ResizeHandleId
    startClientX: number
    startClientY: number
    origin: {
      xMm: number
      yMm: number
      widthMm: number
      heightMm: number
      rotationDeg: number
    }
  } | null>(null)

  const rotateDragRef = useRef<{
    centerPageMm: { xMm: number; yMm: number }
    originRotation: number
  } | null>(null)

  // 1. Handle Resize Start
  const handleResizePointerDown = (handle: ResizeHandleId, event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

    resizeDragRef.current = {
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: {
        xMm: element.xMm,
        yMm: absoluteYMm,
        widthMm: element.widthMm,
        heightMm: element.heightMm,
        rotationDeg: element.rotationDeg ?? 0,
      },
    }
  }

  // 2. Handle Resize Move
  const handleResizePointerMove = (event: React.PointerEvent) => {
    if (!resizeDragRef.current) return
    const { handle, startClientX, startClientY, origin } = resizeDragRef.current

    const dxPx = event.clientX - startClientX
    const dyPx = event.clientY - startClientY
    const dxMm = dxPx / scale
    const dyMm = dyPx / scale

    const lockAspect = lockAspectRatio || event.shiftKey

    const result = computeResizeTransform({
      handle,
      origin,
      deltaGlobalMm: { dx: dxMm, dy: dyMm },
      lockAspectRatio: lockAspect,
    })

    onTransform(result)
  }

  // 3. Handle Resize Up
  const handleResizePointerUp = (event: React.PointerEvent) => {
    if (!resizeDragRef.current) return
    ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)
    resizeDragRef.current = null
    onCommit()
  }

  // 4. Handle Rotate Start
  const handleRotatePointerDown = (event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

    // Center in page mm coordinates
    const centerPageMm = {
      xMm: element.xMm + element.widthMm / 2,
      yMm: absoluteYMm + element.heightMm / 2,
    }

    rotateDragRef.current = {
      centerPageMm,
      originRotation: element.rotationDeg ?? 0,
    }
    setActiveRotatingAngle(element.rotationDeg ?? 0)
  }

  // 5. Handle Rotate Move
  const handleRotatePointerMove = (event: React.PointerEvent) => {
    if (!rotateDragRef.current) return
    const { centerPageMm } = rotateDragRef.current

    const pageContainer = (event.target as HTMLElement).closest('.sn-page-sheet')
    if (!pageContainer) return
    const rect = pageContainer.getBoundingClientRect()

    const pointerPageMm = {
      xMm: (event.clientX - rect.left) / scale,
      yMm: (event.clientY - rect.top) / scale,
    }

    const angle = computeRotationAngle(centerPageMm, pointerPageMm, event.shiftKey)
    setActiveRotatingAngle(angle)
    onRotate(angle)
  }

  // 6. Handle Rotate Up
  const handleRotatePointerUp = (event: React.PointerEvent) => {
    if (!rotateDragRef.current) return
    ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)
    rotateDragRef.current = null
    setActiveRotatingAngle(null)
    onCommit()
  }

  const leftPx = element.xMm * scale
  const topPx = absoluteYMm * scale
  const widthPx = element.widthMm * scale
  const heightPx = element.heightMm * scale
  const rotation = element.rotationDeg ?? 0

  return (
    <div
      className="sn-selection-box"
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      {/* 8 Resize Handles */}
      {HANDLES.map((handle) => (
        <div
          key={handle}
          className={`sn-resize-handle ${handle}`}
          onPointerDown={(e) => handleResizePointerDown(handle, e)}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        />
      ))}

      {/* Rotation Stem & Knob */}
      <div className="sn-rotation-stem" />
      <div
        className="sn-rotation-knob"
        onPointerDown={handleRotatePointerDown}
        onPointerMove={handleRotatePointerMove}
        onPointerUp={handleRotatePointerUp}
      />

      {/* Angle Readout Pill */}
      {activeRotatingAngle !== null && (
        <div className="sn-angle-tooltip">{activeRotatingAngle}°</div>
      )}
    </div>
  )
}
