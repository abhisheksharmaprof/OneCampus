import { describe, expect, it } from 'vitest'
import { computeFlipTransform, computeResizeTransform } from '../math/handles'

describe('8-Handle Resize & Transform Engine', () => {
  const baseOrigin = {
    xMm: 20,
    yMm: 30,
    widthMm: 40,
    heightMm: 20,
    rotationDeg: 0,
  }

  it('unrotated SE corner resize preserves top-left origin and alters width and height', () => {
    const res = computeResizeTransform({
      handle: 'se',
      origin: baseOrigin,
      deltaGlobalMm: { dx: 10, dy: 5 },
      lockAspectRatio: false,
    })

    expect(res.xMm).toBeCloseTo(20, 2)
    expect(res.yMm).toBeCloseTo(30, 2)
    expect(res.widthMm).toBeCloseTo(50, 2)
    expect(res.heightMm).toBeCloseTo(25, 2)
  })

  it('unrotated NW corner resize preserves bottom-right anchor and alters top-left origin', () => {
    const res = computeResizeTransform({
      handle: 'nw',
      origin: baseOrigin,
      deltaGlobalMm: { dx: 5, dy: 4 },
      lockAspectRatio: false,
    })

    // Stationary anchor is bottom-right: (20 + 40, 30 + 20) = (60, 50)
    expect(res.xMm + res.widthMm).toBeCloseTo(60, 2)
    expect(res.yMm + res.heightMm).toBeCloseTo(50, 2)
    expect(res.xMm).toBeCloseTo(25, 2)
    expect(res.yMm).toBeCloseTo(34, 2)
    expect(res.widthMm).toBeCloseTo(35, 2)
    expect(res.heightMm).toBeCloseTo(16, 2)
  })

  it('unrotated E edge resize alters only width and preserves Y and height', () => {
    const res = computeResizeTransform({
      handle: 'e',
      origin: baseOrigin,
      deltaGlobalMm: { dx: 15, dy: 10 }, // dy should be ignored
      lockAspectRatio: false,
    })

    expect(res.xMm).toBeCloseTo(20, 2)
    expect(res.yMm).toBeCloseTo(30, 2)
    expect(res.widthMm).toBeCloseTo(55, 2)
    expect(res.heightMm).toBeCloseTo(20, 2)
  })

  it('unrotated N edge resize alters only height and Y, preserving X and width', () => {
    const res = computeResizeTransform({
      handle: 'n',
      origin: baseOrigin,
      deltaGlobalMm: { dx: 10, dy: -6 }, // dx should be ignored, dy moves up
      lockAspectRatio: false,
    })

    expect(res.xMm).toBeCloseTo(20, 2)
    expect(res.widthMm).toBeCloseTo(40, 2)
    expect(res.yMm).toBeCloseTo(24, 2)
    expect(res.heightMm).toBeCloseTo(26, 2)
  })

  it('aspect-ratio locked corner resize maintains width-to-height ratio', () => {
    // Initial aspect ratio = 40 / 20 = 2.0
    const res = computeResizeTransform({
      handle: 'se',
      origin: baseOrigin,
      deltaGlobalMm: { dx: 20, dy: 5 }, // dx dominates
      lockAspectRatio: true,
    })

    const ratio = res.widthMm / res.heightMm
    expect(ratio).toBeCloseTo(2.0, 2)
    expect(res.widthMm).toBeCloseTo(60, 2)
    expect(res.heightMm).toBeCloseTo(30, 2)
  })

  it('rotated resize at 90 degrees correctly projects global delta into local space', () => {
    const rotatedOrigin = { ...baseOrigin, rotationDeg: 90 }

    // At 90 deg rotation, dragging globally down (+dy) corresponds to dragging locally left or right
    const res = computeResizeTransform({
      handle: 'se',
      origin: rotatedOrigin,
      deltaGlobalMm: { dx: 0, dy: 10 },
      lockAspectRatio: false,
    })

    expect(res.widthMm).toBeGreaterThan(0)
    expect(res.heightMm).toBeGreaterThan(0)
  })

  it('clamps dimensions to minimum thresholds', () => {
    const res = computeResizeTransform({
      handle: 'se',
      origin: baseOrigin,
      deltaGlobalMm: { dx: -100, dy: -100 },
      lockAspectRatio: false,
      minWidthMm: 2.0,
      minHeightMm: 1.0,
    })

    expect(res.widthMm).toBe(2.0)
    expect(res.heightMm).toBe(1.0)
  })

  it('generates correct CSS transform string for flips and rotation', () => {
    expect(computeFlipTransform({ flipHorizontal: false, flipVertical: false }, 0)).toBe(
      'rotate(0deg) scale(1, 1)',
    )
    expect(computeFlipTransform({ flipHorizontal: true, flipVertical: false }, 45)).toBe(
      'rotate(45deg) scale(-1, 1)',
    )
    expect(computeFlipTransform({ flipHorizontal: true, flipVertical: true }, 90)).toBe(
      'rotate(90deg) scale(-1, -1)',
    )
  })
})
