import type { SnapEngineResult, SnapGuideLine, SnapTarget } from '../types'
import { SNAP_TOLERANCE_MM } from '../constants'

export interface SnapBox {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export interface SnapPageContext {
  widthMm: number
  heightMm: number
  marginsMm: { top: number; right: number; bottom: number; left: number }
}

export interface SnapZonesContext {
  headerMm: number
  footerMm: number
}

/**
 * Computes magnetic snapping for a moving element against page margins,
 * center lines, stationery zone lines, and sibling elements.
 */
export function computeStudioSnap(
  movingBox: SnapBox,
  siblings: SnapBox[],
  page: SnapPageContext,
  zones: SnapZonesContext,
  toleranceMm = SNAP_TOLERANCE_MM,
): SnapEngineResult {
  // 1. Build Target Sets
  const xTargets: SnapTarget[] = [
    { axis: 'x', positionMm: page.marginsMm.left, kind: 'margin', label: 'Left Margin' },
    { axis: 'x', positionMm: page.widthMm / 2, kind: 'center', label: 'Page Center' },
    { axis: 'x', positionMm: page.widthMm - page.marginsMm.right, kind: 'margin', label: 'Right Margin' },
    { axis: 'x', positionMm: 0, kind: 'margin', label: 'Page Left' },
    { axis: 'x', positionMm: page.widthMm, kind: 'margin', label: 'Page Right' },
  ]

  const yTargets: SnapTarget[] = [
    { axis: 'y', positionMm: page.marginsMm.top, kind: 'margin', label: 'Top Margin' },
    { axis: 'y', positionMm: page.heightMm / 2, kind: 'center', label: 'Page Middle' },
    { axis: 'y', positionMm: page.heightMm - page.marginsMm.bottom, kind: 'margin', label: 'Bottom Margin' },
    { axis: 'y', positionMm: 0, kind: 'margin', label: 'Page Top' },
    { axis: 'y', positionMm: page.heightMm, kind: 'margin', label: 'Page Bottom' },
  ]

  if (zones.headerMm > 0) {
    yTargets.push({ axis: 'y', positionMm: zones.headerMm, kind: 'zone', label: 'Header Zone' })
  }
  if (zones.footerMm > 0) {
    yTargets.push({
      axis: 'y',
      positionMm: page.heightMm - zones.footerMm,
      kind: 'zone',
      label: 'Footer Zone',
    })
  }

  for (const s of siblings) {
    xTargets.push(
      { axis: 'x', positionMm: s.xMm, kind: 'sibling-edge' },
      { axis: 'x', positionMm: s.xMm + s.widthMm / 2, kind: 'sibling-center' },
      { axis: 'x', positionMm: s.xMm + s.widthMm, kind: 'sibling-edge' },
    )
    yTargets.push(
      { axis: 'y', positionMm: s.yMm, kind: 'sibling-edge' },
      { axis: 'y', positionMm: s.yMm + s.heightMm / 2, kind: 'sibling-center' },
      { axis: 'y', positionMm: s.yMm + s.heightMm, kind: 'sibling-edge' },
    )
  }

  const guides: SnapGuideLine[] = []

  const snapOneAxis = (
    pos: number,
    size: number,
    targets: SnapTarget[],
  ): number => {
    const testPoints = [
      { offset: 0, val: pos },
      { offset: size / 2, val: pos + size / 2 },
      { offset: size, val: pos + size },
    ]

    let bestDelta = Infinity
    let snappedPos = pos
    let bestTarget: SnapTarget | null = null

    for (const target of targets) {
      for (const pt of testPoints) {
        const delta = Math.abs(pt.val - target.positionMm)
        if (delta <= toleranceMm && delta < bestDelta) {
          bestDelta = delta
          snappedPos = target.positionMm - pt.offset
          bestTarget = target
        }
      }
    }

    if (bestTarget) {
      guides.push({
        axis: bestTarget.axis,
        positionMm: bestTarget.positionMm,
        kind: bestTarget.kind,
      })
      return Math.round(snappedPos * 100) / 100
    }
    return Math.round(pos * 100) / 100
  }

  const snappedX = snapOneAxis(movingBox.xMm, movingBox.widthMm, xTargets)
  const snappedY = snapOneAxis(movingBox.yMm, movingBox.heightMm, yTargets)

  return {
    xMm: snappedX,
    yMm: snappedY,
    guides,
  }
}
