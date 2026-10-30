import type { ResizeHandleId } from '../types'
import { MIN_ELEMENT_WIDTH_MM, MIN_ELEMENT_HEIGHT_MM } from '../constants'

export interface HandleTransformParams {
  handle: ResizeHandleId
  origin: {
    xMm: number
    yMm: number
    widthMm: number
    heightMm: number
    rotationDeg: number
  }
  deltaGlobalMm: { dx: number; dy: number }
  lockAspectRatio: boolean
  minWidthMm?: number
  minHeightMm?: number
}

export interface ResizeTransformResult {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

/**
 * Computes the transformed (x, y, w, h) of an element when dragging any of its 8 resize handles,
 * preserving the stationary anchor opposite to the handle even when rotated at an arbitrary angle.
 */
export function computeResizeTransform({
  handle,
  origin,
  deltaGlobalMm,
  lockAspectRatio,
  minWidthMm = MIN_ELEMENT_WIDTH_MM,
  minHeightMm = MIN_ELEMENT_HEIGHT_MM,
}: HandleTransformParams): ResizeTransformResult {
  const rad = ((origin.rotationDeg ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  // 1. Project global delta to local unrotated coordinate space
  const localDx = deltaGlobalMm.dx * cos + deltaGlobalMm.dy * sin
  const localDy = -deltaGlobalMm.dx * sin + deltaGlobalMm.dy * cos

  const w0 = origin.widthMm
  const h0 = origin.heightMm
  const aspect = w0 / Math.max(0.001, h0)

  let w1 = w0
  let h1 = h0

  // 2. Compute candidate dimensions in local space
  switch (handle) {
    case 'se':
      w1 = w0 + localDx
      h1 = h0 + localDy
      break
    case 'nw':
      w1 = w0 - localDx
      h1 = h0 - localDy
      break
    case 'ne':
      w1 = w0 + localDx
      h1 = h0 - localDy
      break
    case 'sw':
      w1 = w0 - localDx
      h1 = h0 + localDy
      break
    case 'e':
      w1 = w0 + localDx
      h1 = h0
      break
    case 'w':
      w1 = w0 - localDx
      h1 = h0
      break
    case 's':
      w1 = w0
      h1 = h0 + localDy
      break
    case 'n':
      w1 = w0
      h1 = h0 - localDy
      break
  }

  // 3. Aspect ratio constraints
  let finalW: number
  let finalH: number

  if (lockAspectRatio) {
    if (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw') {
      const k = Math.max(w1 / w0, h1 / h0)
      finalW = Math.max(minWidthMm, w0 * k)
      finalH = Math.max(minHeightMm, finalW / aspect)
    } else if (handle === 'e' || handle === 'w') {
      finalW = Math.max(minWidthMm, w1)
      finalH = Math.max(minHeightMm, finalW / aspect)
    } else {
      finalH = Math.max(minHeightMm, h1)
      finalW = Math.max(minWidthMm, finalH * aspect)
    }
  } else {
    finalW = Math.max(minWidthMm, w1)
    finalH = Math.max(minHeightMm, h1)
  }

  // 4. Local anchor vectors (the stationary opposite point)
  let p0x = 0
  let p0y = 0
  let p1x = 0
  let p1y = 0

  switch (handle) {
    case 'se':
      p0x = 0; p0y = 0; p1x = 0; p1y = 0
      break
    case 'nw':
      p0x = w0; p0y = h0; p1x = finalW; p1y = finalH
      break
    case 'ne':
      p0x = 0; p0y = h0; p1x = 0; p1y = finalH
      break
    case 'sw':
      p0x = w0; p0y = 0; p1x = finalW; p1y = 0
      break
    case 'e':
      p0x = 0; p0y = h0 / 2; p1x = 0; p1y = finalH / 2
      break
    case 'w':
      p0x = w0; p0y = h0 / 2; p1x = finalW; p1y = finalH / 2
      break
    case 's':
      p0x = w0 / 2; p0y = 0; p1x = finalW / 2; p1y = 0
      break
    case 'n':
      p0x = w0 / 2; p0y = h0; p1x = finalW / 2; p1y = finalH
      break
  }

  // 5. Global stationary anchor calculation
  const c0x = origin.xMm + w0 / 2
  const c0y = origin.yMm + h0 / 2

  const d0x = p0x - w0 / 2
  const d0y = p0y - h0 / 2
  const anchorGlobalX = c0x + (d0x * cos - d0y * sin)
  const anchorGlobalY = c0y + (d0x * sin + d0y * cos)

  // 6. Recover new center and unrotated top-left origin from stationary anchor
  const d1x = p1x - finalW / 2
  const d1y = p1y - finalH / 2
  const c1x = anchorGlobalX - (d1x * cos - d1y * sin)
  const c1y = anchorGlobalY - (d1x * sin + d1y * cos)

  return {
    xMm: Math.round((c1x - finalW / 2) * 100) / 100,
    yMm: Math.round((c1y - finalH / 2) * 100) / 100,
    widthMm: Math.round(finalW * 100) / 100,
    heightMm: Math.round(finalH * 100) / 100,
  }
}

/**
 * Computes rotation angle in degrees from center origin to pointer position.
 * Snaps to 15-degree increments when shiftHeld is true.
 * Returns angle normalized within [-179, 180].
 */
export function computeRotationAngle(
  center: { xMm: number; yMm: number },
  pointer: { xMm: number; yMm: number },
  shiftHeld = false,
): number {
  const dx = pointer.xMm - center.xMm
  const dy = pointer.yMm - center.yMm
  // atan2 with dx, -dy because canvas Y is positive downwards, stem points upward
  const rad = Math.atan2(dx, -dy)
  let deg = Math.round((rad * 180) / Math.PI)

  if (shiftHeld) {
    deg = Math.round(deg / 15) * 15
  }

  // Normalize into [-179, 180]
  while (deg <= -180) deg += 360
  while (deg > 180) deg -= 360
  return deg
}

export interface FlipState {
  flipHorizontal?: boolean
  flipVertical?: boolean
}

export function computeFlipTransform(flip: FlipState, rotationDeg = 0): string {
  const sx = flip.flipHorizontal ? -1 : 1
  const sy = flip.flipVertical ? -1 : 1
  return `rotate(${rotationDeg}deg) scale(${sx}, ${sy})`
}
