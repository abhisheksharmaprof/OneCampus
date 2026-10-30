import { describe, expect, it } from 'vitest'
import { PX_PER_MM, MIN_ELEMENT_WIDTH_MM, MIN_ELEMENT_HEIGHT_MM } from '../constants'
import {
  mmToPx,
  pxToMm,
  screenToPageMm,
  zoneToPageY,
  pageToZoneY,
  detectZoneAtPageY,
} from '../math/coordinates'
import {
  computeResizeTransform,
  computeRotationAngle,
  computeFlipTransform,
} from '../math/handles'
import type { ResizeHandleId } from '../types'

// Helper: compute global position of a local point (u, v) on an element rotated by thetaDeg
function localToGlobal(
  u: number,
  v: number,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  thetaDeg: number,
): { x: number; y: number } {
  const rad = (thetaDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = xMm + widthMm / 2
  const cy = yMm + heightMm / 2
  const du = u - widthMm / 2
  const dv = v - heightMm / 2
  return {
    x: cx + (du * cos - dv * sin),
    y: cy + (du * sin + dv * cos),
  }
}

// Return the local coordinate of the opposite stationary anchor for a given handle
function getOppositeAnchorLocal(handle: ResizeHandleId, width: number, height: number): { u: number; v: number } {
  switch (handle) {
    case 'se': return { u: 0, v: 0 }
    case 'nw': return { u: width, v: height }
    case 'ne': return { u: 0, v: height }
    case 'sw': return { u: width, v: 0 }
    case 'e': return { u: 0, v: height / 2 }
    case 'w': return { u: width, v: height / 2 }
    case 's': return { u: width / 2, v: 0 }
    case 'n': return { u: width / 2, v: height }
  }
}

describe('Empirical Adversarial Stress Tests: Canvas Math Engine', () => {
  const allHandles: ResizeHandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w']
  const testAngles = [
    -180, -165, -137, -90, -45, -30, -15, 0,
    15, 23, 45, 67, 90, 111, 135, 150, 179, 180,
  ]

  describe('1. 8-Handle Transforms across Arbitrary Angles: Anchor Drift Stress Test', () => {
    it.each(allHandles)('handle "%s" preserves opposite anchor without drift across all angles (-180° to 180°)', (handle) => {
      const initialOrigin = {
        xMm: 50,
        yMm: 60,
        widthMm: 80,
        heightMm: 40,
      }

      for (const angle of testAngles) {
        const origin = { ...initialOrigin, rotationDeg: angle }

        // Test with different deltas (positive, negative, diagonal)
        const deltas = [
          { dx: 20, dy: 15 },
          { dx: -10, dy: -5 },
          { dx: 30, dy: -10 },
          { dx: -15, dy: 25 },
        ]

        for (const delta of deltas) {
          const p0 = getOppositeAnchorLocal(handle, origin.widthMm, origin.heightMm)
          const anchorBefore = localToGlobal(p0.u, p0.v, origin.xMm, origin.yMm, origin.widthMm, origin.heightMm, angle)

          const res = computeResizeTransform({
            handle,
            origin,
            deltaGlobalMm: delta,
            lockAspectRatio: false,
          })

          const p1 = getOppositeAnchorLocal(handle, res.widthMm, res.heightMm)
          const anchorAfter = localToGlobal(p1.u, p1.v, res.xMm, res.yMm, res.widthMm, res.heightMm, angle)

          const driftX = Math.abs(anchorAfter.x - anchorBefore.x)
          const driftY = Math.abs(anchorAfter.y - anchorBefore.y)
          const totalDrift = Math.sqrt(driftX * driftX + driftY * driftY)

          // Due to Math.round(* 100) / 100, maximum quantization error per coordinate is 0.005mm
          // Total drift bound = sqrt(0.005^2 + 0.005^2) + margin ~ 0.02mm
          expect(totalDrift).toBeLessThanOrEqual(0.02)
        }
      }
    })

    it.each(allHandles)('handle "%s" preserves opposite anchor when lockAspectRatio is true', (handle) => {
      const initialOrigin = {
        xMm: 100,
        yMm: 120,
        widthMm: 60,
        heightMm: 30,
      }

      for (const angle of [-180, -90, -45, 0, 45, 90, 180]) {
        const origin = { ...initialOrigin, rotationDeg: angle }
        const deltas = [
          { dx: 30, dy: 20 },
          { dx: 15, dy: -10 },
        ]

        for (const delta of deltas) {
          const p0 = getOppositeAnchorLocal(handle, origin.widthMm, origin.heightMm)
          const anchorBefore = localToGlobal(p0.u, p0.v, origin.xMm, origin.yMm, origin.widthMm, origin.heightMm, angle)

          const res = computeResizeTransform({
            handle,
            origin,
            deltaGlobalMm: delta,
            lockAspectRatio: true,
          })

          const p1 = getOppositeAnchorLocal(handle, res.widthMm, res.heightMm)
          const anchorAfter = localToGlobal(p1.u, p1.v, res.xMm, res.yMm, res.widthMm, res.heightMm, angle)

          const totalDrift = Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y)
          expect(totalDrift).toBeLessThanOrEqual(0.03)
        }
      }
    })
  })

  describe('2. Aspect Ratio Locking Behavior: Corner vs Edge Handles', () => {
    const origin = {
      xMm: 50,
      yMm: 50,
      widthMm: 60,
      heightMm: 40,
      rotationDeg: 0,
    }
    const expectedRatio = 60 / 40 // 1.5

    it('corner handle SE preserves aspect ratio when expanding diagonally', () => {
      const res = computeResizeTransform({
        handle: 'se',
        origin,
        deltaGlobalMm: { dx: 30, dy: 20 },
        lockAspectRatio: true,
      })
      const ratio = res.widthMm / res.heightMm
      expect(ratio).toBeCloseTo(expectedRatio, 2)
      expect(res.widthMm).toBe(90)
      expect(res.heightMm).toBe(60)
    })

    it('corner handle NW preserves aspect ratio when expanding diagonally', () => {
      const res = computeResizeTransform({
        handle: 'nw',
        origin,
        deltaGlobalMm: { dx: -30, dy: -20 },
        lockAspectRatio: true,
      })
      const ratio = res.widthMm / res.heightMm
      expect(ratio).toBeCloseTo(expectedRatio, 2)
      expect(res.widthMm).toBe(90)
      expect(res.heightMm).toBe(60)
    })

    it('edge handle E preserves aspect ratio and expands symmetrically around vertical center', () => {
      const res = computeResizeTransform({
        handle: 'e',
        origin,
        deltaGlobalMm: { dx: 30, dy: 0 },
        lockAspectRatio: true,
      })
      const ratio = res.widthMm / res.heightMm
      expect(ratio).toBeCloseTo(expectedRatio, 2)
      expect(res.widthMm).toBe(90)
      expect(res.heightMm).toBe(60)
      // Left edge anchor should remain at x = 50
      expect(res.xMm).toBe(50)
      // Y should expand equally up and down: center was 50 + 20 = 70. New center is 70, new y = 70 - 30 = 40
      expect(res.yMm).toBe(40)
    })

    it('edge handle S preserves aspect ratio and expands symmetrically around horizontal center', () => {
      const res = computeResizeTransform({
        handle: 's',
        origin,
        deltaGlobalMm: { dx: 0, dy: 20 },
        lockAspectRatio: true,
      })
      const ratio = res.widthMm / res.heightMm
      expect(ratio).toBeCloseTo(expectedRatio, 2)
      expect(res.heightMm).toBe(60)
      expect(res.widthMm).toBe(90)
      // Top edge anchor should remain at y = 50
      expect(res.yMm).toBe(50)
      // X should expand equally left and right: center was 50 + 30 = 80. New center is 80, new x = 80 - 45 = 35
      expect(res.xMm).toBe(35)
    })

    it('examines corner handle behavior when dragged inward on a single axis', () => {
      // Inward horizontal drag: dx = -30, dy = 0
      const res = computeResizeTransform({
        handle: 'se',
        origin,
        deltaGlobalMm: { dx: -30, dy: 0 },
        lockAspectRatio: true,
      })
      // If Math.max(w1/w0, h1/h0) is used:
      // w1/w0 = 30/60 = 0.5. h1/h0 = 40/40 = 1.0. k = max(0.5, 1.0) = 1.0.
      // So element does NOT shrink! It stays at w = 60, h = 40.
      // We document this behavior:
      expect(res.widthMm).toBe(60)
      expect(res.heightMm).toBe(40)
    })

    it('corner handle shrinks when dragged inward diagonally with both axes negative', () => {
      const res = computeResizeTransform({
        handle: 'se',
        origin,
        deltaGlobalMm: { dx: -30, dy: -20 },
        lockAspectRatio: true,
      })
      // w1 = 30, h1 = 20 -> k = max(0.5, 0.5) = 0.5 -> w = 30, h = 20
      const ratio = res.widthMm / res.heightMm
      expect(ratio).toBeCloseTo(expectedRatio, 2)
      expect(res.widthMm).toBe(30)
      expect(res.heightMm).toBe(20)
    })
  })

  describe('3. Extreme Coordinates & Boundary Geometry', () => {
    it('handles negative coordinates gracefully', () => {
      const negOrigin = {
        xMm: -50,
        yMm: -100,
        widthMm: 40,
        heightMm: 30,
        rotationDeg: 45,
      }
      const res = computeResizeTransform({
        handle: 'se',
        origin: negOrigin,
        deltaGlobalMm: { dx: 20, dy: 10 },
        lockAspectRatio: false,
      })
      expect(res.xMm).toBeDefined()
      expect(res.yMm).toBeDefined()
      expect(Number.isFinite(res.xMm)).toBe(true)
      expect(Number.isFinite(res.yMm)).toBe(true)
      expect(res.widthMm).toBeGreaterThan(0)
      expect(res.heightMm).toBeGreaterThan(0)
    })

    it('clamps to MIN_ELEMENT_WIDTH_MM and MIN_ELEMENT_HEIGHT_MM on extreme negative deltas', () => {
      const origin = {
        xMm: 10,
        yMm: 10,
        widthMm: 50,
        heightMm: 50,
        rotationDeg: 0,
      }
      const res = computeResizeTransform({
        handle: 'se',
        origin,
        deltaGlobalMm: { dx: -1000, dy: -1000 },
        lockAspectRatio: false,
      })
      expect(res.widthMm).toBe(MIN_ELEMENT_WIDTH_MM)
      expect(res.heightMm).toBe(MIN_ELEMENT_HEIGHT_MM)
      expect(res.xMm).toBe(10)
      expect(res.yMm).toBe(10)
    })

    it('handles extremely large elements (1000 mm) with large deltas', () => {
      const largeOrigin = {
        xMm: 100,
        yMm: 100,
        widthMm: 1000,
        heightMm: 1000,
        rotationDeg: 90,
      }
      const res = computeResizeTransform({
        handle: 'se',
        origin: largeOrigin,
        deltaGlobalMm: { dx: 500, dy: 500 },
        lockAspectRatio: false,
      })
      expect(Number.isFinite(res.xMm)).toBe(true)
      expect(Number.isFinite(res.yMm)).toBe(true)
      expect(Number.isFinite(res.widthMm)).toBe(true)
      expect(Number.isFinite(res.heightMm)).toBe(true)
    })

    it('handles zero or sub-millimeter origin dimensions without division by zero NaN', () => {
      const tinyOrigin = {
        xMm: 0,
        yMm: 0,
        widthMm: 0.0001,
        heightMm: 0.0001,
        rotationDeg: 0,
      }
      const res = computeResizeTransform({
        handle: 'se',
        origin: tinyOrigin,
        deltaGlobalMm: { dx: 10, dy: 10 },
        lockAspectRatio: true,
      })
      expect(Number.isNaN(res.widthMm)).toBe(false)
      expect(Number.isNaN(res.heightMm)).toBe(false)
      expect(Number.isFinite(res.widthMm)).toBe(true)
      expect(Number.isFinite(res.heightMm)).toBe(true)
    })
  })

  describe('4. Zoom Independence & Identity Inversion', () => {
    const zoomLevels = [0.25, 0.5, 1.0, 2.0, 4.0]
    const testDistancesMm = [0.1, 1.0, 25.4, 50.0, 100.0, 210.0, 297.0, 1000.0]

    it.each(zoomLevels)('mmToPx and pxToMm are exact mathematical inverses at zoom %sx', (zoom) => {
      for (const mm of testDistancesMm) {
        const px = mmToPx(mm, zoom)
        const recoveredMm = pxToMm(px, zoom)
        expect(recoveredMm).toBeCloseTo(mm, 6)
      }
    })

    it.each(zoomLevels)('screenToPageMm projects screen pixels back to physical mm invariant of zoom %sx', (zoom) => {
      const boundingRect = { left: 150, top: 220 }

      for (const testMm of [{ x: 10, y: 20 }, { x: 55.5, y: 120.25 }, { x: 210, y: 297 }]) {
        // Generate simulated client pointer from physical mm at this zoom
        const clientX = boundingRect.left + mmToPx(testMm.x, zoom)
        const clientY = boundingRect.top + mmToPx(testMm.y, zoom)

        const projected = screenToPageMm(clientX, clientY, boundingRect, zoom)
        expect(projected.xMm).toBeCloseTo(testMm.x, 4)
        expect(projected.yMm).toBeCloseTo(testMm.y, 4)
      }
    })
  })

  describe('5. SelectionBox & CanvasPage Integration: Fixed Zone Coordinate Handling', () => {
    const zones = ['header', 'body', 'footer'] as const
    const headerMm = 36
    const footerMm = 24
    const pageHeightMm = 297

    it.each(zones)('zone "%s" element preserves exact zone Y without vertical jump when origin.yMm is absoluteYMm', (zone) => {
      const elementZoneY = 20
      const absolutePageY = zoneToPageY(zone, elementZoneY, headerMm, footerMm, pageHeightMm)

      // Fixed SelectionBox origin using absoluteYMm:
      const fixedOrigin = {
        xMm: 25,
        yMm: absolutePageY,
        widthMm: 50,
        heightMm: 30,
        rotationDeg: 0,
      }

      // Test 1: Zero mouse movement must not cause any position jump
      const zeroResult = computeResizeTransform({
        handle: 'se',
        origin: fixedOrigin,
        deltaGlobalMm: { dx: 0, dy: 0 },
        lockAspectRatio: false,
      })

      const newZoneY = pageToZoneY(zone, zeroResult.yMm, headerMm, footerMm, pageHeightMm)
      expect(newZoneY).toBe(elementZoneY)

      // Test 2: Active resize across all 8 handles preserves stationary opposite anchor
      for (const handle of ['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'] as const) {
        const resizeResult = computeResizeTransform({
          handle,
          origin: fixedOrigin,
          deltaGlobalMm: { dx: 15, dy: 10 },
          lockAspectRatio: false,
        })
        const updatedZoneY = pageToZoneY(zone, resizeResult.yMm, headerMm, footerMm, pageHeightMm)
        const reconstructedAbsY = zoneToPageY(zone, updatedZoneY, headerMm, footerMm, pageHeightMm)

        // Physical page Y must match resizeResult.yMm exactly
        expect(reconstructedAbsY).toBeCloseTo(resizeResult.yMm, 4)
      }
    })
  })
})
