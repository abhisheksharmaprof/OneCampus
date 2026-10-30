import { describe, expect, it } from 'vitest'
import { computeStudioSnap } from '../math/snap'

describe('Dynamic Alignment Snapping Engine', () => {
  const page = {
    widthMm: 210,
    heightMm: 297,
    marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
  }

  const zones = {
    headerMm: 35,
    footerMm: 20,
  }

  it('snaps moving element left edge to page left margin when within tolerance', () => {
    // Left margin is 15mm; element placed at x = 15.8mm (delta = 0.8mm < 1.5mm)
    const result = computeStudioSnap(
      { xMm: 15.8, yMm: 50, widthMm: 40, heightMm: 20 },
      [],
      page,
      zones,
      1.5,
    )

    expect(result.xMm).toBe(15)
    expect(result.guides.some((g) => g.axis === 'x' && g.positionMm === 15)).toBe(true)
  })

  it('snaps element center to page vertical center line', () => {
    // Page width = 210mm -> center is 105mm. Element width = 40mm.
    // If element x = 84.5, center is 84.5 + 20 = 104.5 (delta = 0.5mm < 1.5mm)
    const result = computeStudioSnap(
      { xMm: 84.5, yMm: 50, widthMm: 40, heightMm: 20 },
      [],
      page,
      zones,
      1.5,
    )

    expect(result.xMm).toBe(85) // 85 + 20 = 105
    expect(result.guides.some((g) => g.axis === 'x' && g.positionMm === 105)).toBe(true)
  })

  it('snaps top edge to header zone boundary line', () => {
    // Header zone is at y = 35mm. Element placed at y = 35.6mm (delta = 0.6mm)
    const result = computeStudioSnap(
      { xMm: 50, yMm: 35.6, widthMm: 40, heightMm: 20 },
      [],
      page,
      zones,
      1.5,
    )

    expect(result.yMm).toBe(35)
    expect(result.guides.some((g) => g.axis === 'y' && g.positionMm === 35)).toBe(true)
  })

  it('snaps bottom edge to footer zone boundary line', () => {
    // Footer zone boundary is at 297 - 20 = 277mm.
    // Element height = 20mm. Element y = 256.2mm -> bottom = 276.2mm (delta = 0.8mm)
    const result = computeStudioSnap(
      { xMm: 50, yMm: 256.2, widthMm: 40, heightMm: 20 },
      [],
      page,
      zones,
      1.5,
    )

    expect(result.yMm).toBe(257) // 257 + 20 = 277
    expect(result.guides.some((g) => g.axis === 'y' && g.positionMm === 277)).toBe(true)
  })

  it('snaps to sibling element edge when adjacent', () => {
    const sibling = { xMm: 20, yMm: 60, widthMm: 50, heightMm: 30 } // right edge at 70mm
    // Moving element placed at x = 70.8mm (delta = 0.8mm from sibling right edge)
    const result = computeStudioSnap(
      { xMm: 70.8, yMm: 60, widthMm: 30, heightMm: 20 },
      [sibling],
      page,
      zones,
      1.5,
    )

    expect(result.xMm).toBe(70)
    expect(result.guides.some((g) => g.axis === 'x' && g.positionMm === 70)).toBe(true)
  })

  it('ignores targets further than tolerance distance and emits no false guides', () => {
    // Moving element placed at (45, 80) which is far from margins (15, 195), center (105), zones (35, 277)
    const result = computeStudioSnap(
      { xMm: 45, yMm: 80, widthMm: 20, heightMm: 20 },
      [],
      page,
      zones,
      1.5,
    )

    expect(result.xMm).toBe(45)
    expect(result.yMm).toBe(80)
    expect(result.guides.length).toBe(0)
  })
})
