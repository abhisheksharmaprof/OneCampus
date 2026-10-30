import { describe, expect, it } from 'vitest'
import { computeRotationAngle } from '../math/handles'

describe('Rotation Stem & Angular Snapping', () => {
  const center = { xMm: 100, yMm: 100 }

  it('computes 0 degrees when pointer is vertically above center', () => {
    const angle = computeRotationAngle(center, { xMm: 100, yMm: 50 }, false)
    expect(angle).toBe(0)
  })

  it('computes 90 degrees when pointer is directly to the right', () => {
    const angle = computeRotationAngle(center, { xMm: 150, yMm: 100 }, false)
    expect(angle).toBe(90)
  })

  it('computes 180 degrees when pointer is vertically below center', () => {
    const angle = computeRotationAngle(center, { xMm: 100, yMm: 150 }, false)
    expect(angle).toBe(180)
  })

  it('computes -90 degrees when pointer is directly to the left', () => {
    const angle = computeRotationAngle(center, { xMm: 50, yMm: 100 }, false)
    expect(angle).toBe(-90)
  })

  it('computes 45 degrees for northeast vector', () => {
    const angle = computeRotationAngle(center, { xMm: 150, yMm: 50 }, false)
    expect(angle).toBe(45)
  })

  it('quantizes to 15-degree increments when shift key is held', () => {
    // 13 deg -> snaps to 15
    const angle13 = computeRotationAngle(center, { xMm: 100 + 10 * Math.sin((13 * Math.PI) / 180), yMm: 100 - 10 * Math.cos((13 * Math.PI) / 180) }, true)
    expect(angle13).toBe(15)

    // 22 deg -> snaps to 15
    const angle22 = computeRotationAngle(center, { xMm: 100 + 10 * Math.sin((22 * Math.PI) / 180), yMm: 100 - 10 * Math.cos((22 * Math.PI) / 180) }, true)
    expect(angle22).toBe(15)

    // 23 deg -> snaps to 30
    const angle23 = computeRotationAngle(center, { xMm: 100 + 10 * Math.sin((23 * Math.PI) / 180), yMm: 100 - 10 * Math.cos((23 * Math.PI) / 180) }, true)
    expect(angle23).toBe(30)
  })

  it('normalizes angles strictly into [-179, 180]', () => {
    const pos = computeRotationAngle(center, { xMm: 100, yMm: 150 }, false)
    expect(pos).toBeLessThanOrEqual(180)
    expect(pos).toBeGreaterThanOrEqual(-179)
  })
})
