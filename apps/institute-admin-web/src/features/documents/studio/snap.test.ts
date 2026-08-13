import { describe, expect, it } from 'vitest'
import { computeSnap } from './snap'

const page = { w: 210, h: 297, margin: 10 }

describe('computeSnap', () => {
  it('snaps the left edge to the page margin within tolerance', () => {
    const result = computeSnap({ x: 11.2, y: 50, w: 40, h: 10 }, [], page)
    expect(result.x).toBe(10)
    expect(result.guides.some((guide) => guide.orientation === 'v' && guide.positionMm === 10)).toBe(true)
  })

  it('snaps the horizontal centre to the page centre', () => {
    const result = computeSnap({ x: 84.4, y: 50, w: 40, h: 10 }, [], page) // centre 104.4 ≈ 105
    expect(result.x).toBeCloseTo(85)
  })

  it('snaps to a sibling edge and ignores far elements', () => {
    const sibling = { x: 60, y: 20, w: 30, h: 10 }
    const near = computeSnap({ x: 59.1, y: 100, w: 20, h: 10 }, [sibling], page)
    expect(near.x).toBe(60)
    // x: 30 keeps every edge (30 / 40 / 50) > tolerance from all targets; the plan's
    // original x: 40 put the right edge exactly on the sibling's left edge (60),
    // which legitimately emits a zero-delta alignment guide.
    const far = computeSnap({ x: 30, y: 100, w: 20, h: 10 }, [sibling], page)
    expect(far.x).toBe(30)
    expect(far.guides).toHaveLength(0)
  })
})
