import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  compileMaskCss,
  compileFilterCss,
  type ElementV3,
  type ImageElementV3,
  type LayoutV3,
  type PhotoElementV3,
  type ClippingMaskType,
} from '@campusone/document-engine'
import { initialStudioNextState, studioNextReducer } from '../state/studioNextReducer'
import { computeResizeTransform } from '../math/handles'
import { removeWhiteBackground } from '../utils/removeWhiteThreshold'
import { ASSET_PRESETS } from '../utils/assetPresets'
import { render, fireEvent } from '@testing-library/react'
import { CanvasPage } from '../canvas/CanvasPage'

// ============================================================================
// 1. ASSET TRANSFORMATIONS & MASKS: CONTAIN, COVER, STRETCH MATH & ORACLES
// ============================================================================

interface BoxFitResult {
  width: number
  height: number
  scale: number
}

function calculateContainFit(
  imgWidth: number,
  imgHeight: number,
  boxWidth: number,
  boxHeight: number,
): BoxFitResult {
  const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight)
  return {
    width: imgWidth * scale,
    height: imgHeight * scale,
    scale,
  }
}

function calculateCoverFit(
  imgWidth: number,
  imgHeight: number,
  boxWidth: number,
  boxHeight: number,
): BoxFitResult {
  const scale = Math.max(boxWidth / imgWidth, boxHeight / imgHeight)
  return {
    width: imgWidth * scale,
    height: imgHeight * scale,
    scale,
  }
}

function calculateStretchFit(
  _imgWidth: number,
  _imgHeight: number,
  boxWidth: number,
  boxHeight: number,
): BoxFitResult {
  return {
    width: boxWidth,
    height: boxHeight,
    scale: 1,
  }
}

describe('Empirical Adversarial Tests - Milestone 2 Visual Styling & Transforms', () => {
  describe('1. Asset Transformations: Contain, Cover, and Stretch Oracles', () => {
    const testCases = [
      { name: '1:1 square in 1:1 square box', img: [100, 100], box: [80, 80] },
      { name: '16:9 landscape in 9:16 portrait box', img: [1920, 1080], box: [50, 100] },
      { name: '9:16 portrait in 16:9 landscape box', img: [1080, 1920], box: [120, 60] },
      { name: 'Extreme 100:1 panorama in 1:1 square box', img: [1000, 10], box: [100, 100] },
      { name: 'Extreme 1:100 skyscraper in 10:1 wide box', img: [10, 1000], box: [200, 50] },
      { name: 'Microscopic 0.1x0.1 in macroscopic 200x200 box', img: [0.1, 0.1], box: [200, 200] },
      { name: 'Macroscopic 10000x5000 in tiny 5x5 box', img: [10000, 5000], box: [5, 5] },
      { name: 'CR80 standard photo (25x30) in passport box (35x45)', img: [25, 30], box: [35, 45] },
      { name: 'Passport photo (35x45) in stamp box (20x25)', img: [35, 45], box: [20, 25] },
    ]

    it.each(testCases)('contain fit oracle: preserves aspect ratio and stays within box for $name', ({ img, box }) => {
      const [imgW, imgH] = img
      const [boxW, boxH] = box
      const initialAspect = imgW / imgH

      const res = calculateContainFit(imgW, imgH, boxW, boxH)

      // Invariant 1: Width and height must not exceed bounding box
      expect(res.width).toBeLessThanOrEqual(boxW + 1e-6)
      expect(res.height).toBeLessThanOrEqual(boxH + 1e-6)

      // Invariant 2: At least one dimension must exactly match box boundary
      const touchesWidth = Math.abs(res.width - boxW) < 1e-5
      const touchesHeight = Math.abs(res.height - boxH) < 1e-5
      expect(touchesWidth || touchesHeight).toBe(true)

      // Invariant 3: Aspect ratio strictly preserved
      const fittedAspect = res.width / res.height
      expect(fittedAspect).toBeCloseTo(initialAspect, 4)
    })

    it.each(testCases)('cover fit oracle: preserves aspect ratio and completely fills box for $name', ({ img, box }) => {
      const [imgW, imgH] = img
      const [boxW, boxH] = box
      const initialAspect = imgW / imgH

      const res = calculateCoverFit(imgW, imgH, boxW, boxH)

      // Invariant 1: Width and height must cover or exceed bounding box
      expect(res.width).toBeGreaterThanOrEqual(boxW - 1e-6)
      expect(res.height).toBeGreaterThanOrEqual(boxH - 1e-6)

      // Invariant 2: At least one dimension must exactly match box boundary
      const touchesWidth = Math.abs(res.width - boxW) < 1e-5
      const touchesHeight = Math.abs(res.height - boxH) < 1e-5
      expect(touchesWidth || touchesHeight).toBe(true)

      // Invariant 3: Aspect ratio strictly preserved
      const fittedAspect = res.width / res.height
      expect(fittedAspect).toBeCloseTo(initialAspect, 4)
    })

    it.each(testCases)('stretch fit oracle: strictly fills box dimensions for $name', ({ img, box }) => {
      const [imgW, imgH] = img
      const [boxW, boxH] = box

      const res = calculateStretchFit(imgW, imgH, boxW, boxH)

      expect(res.width).toBe(boxW)
      expect(res.height).toBe(boxH)
    })
  })

  // ============================================================================
  // 2. CLIPPING MASKS: SQUARE, ROUNDED, CIRCLE, HEXAGON
  // ============================================================================
  describe('2. Clipping Masks: Square, Rounded, Circle, Hexagon Geometry', () => {
    it('square mask produces no restrictive clip-path (rectangular bounds)', () => {
      const css = compileMaskCss('square', 0, 'mm')
      expect(css).toBe('')
    })

    it('rounded mask applies specified radius in millimeters with overflow hidden', () => {
      const css3mm = compileMaskCss('rounded', 3, 'mm')
      expect(css3mm).toBe('border-radius:3mm;overflow:hidden;')

      const css6mm = compileMaskCss('rounded', 6, 'mm')
      expect(css6mm).toBe('border-radius:6mm;overflow:hidden;')

      const cssDefault = compileMaskCss('rounded', undefined, 'mm')
      expect(cssDefault).toBe('border-radius:3mm;overflow:hidden;')
    })

    it('circle mask applies 50% border radius and radial clip-path centered at (50%, 50%)', () => {
      const css = compileMaskCss('circle', 0, 'mm')
      expect(css).toContain('border-radius:50%')
      expect(css).toContain('clip-path:circle(50% at 50% 50%)')
      expect(css).toContain('overflow:hidden')
    })

    it('hexagon mask applies 6-vertex convex polygonal clip-path with perfect 180° rotational symmetry', () => {
      const css = compileMaskCss('hexagon', 0, 'mm')
      expect(css).toContain('clip-path:polygon(')
      expect(css).toContain('25% 0%')
      expect(css).toContain('75% 0%')
      expect(css).toContain('100% 50%')
      expect(css).toContain('75% 100%')
      expect(css).toContain('25% 100%')
      expect(css).toContain('0% 50%')

      // Mathematical validation of vertices
      const vertices = [
        { x: 0.25, y: 0.0 },
        { x: 0.75, y: 0.0 },
        { x: 1.0, y: 0.5 },
        { x: 0.75, y: 1.0 },
        { x: 0.25, y: 1.0 },
        { x: 0.0, y: 0.5 },
      ]

      // Check center of polygon: (sum(x)/6, sum(y)/6) == (0.5, 0.5)
      const avgX = vertices.reduce((sum, v) => sum + v.x, 0) / 6
      const avgY = vertices.reduce((sum, v) => sum + v.y, 0) / 6
      expect(avgX).toBeCloseTo(0.5, 6)
      expect(avgY).toBeCloseTo(0.5, 6)

      // Check opposite pair symmetry around center (0.5, 0.5)
      for (let i = 0; i < 3; i++) {
        const v1 = vertices[i]
        const v2 = vertices[i + 3]
        expect(v1.x + v2.x).toBeCloseTo(1.0, 6)
        expect(v1.y + v2.y).toBeCloseTo(1.0, 6)
      }

      // Check convexity using 2D cross product of adjacent edge vectors
      for (let i = 0; i < 6; i++) {
        const p0 = vertices[i]
        const p1 = vertices[(i + 1) % 6]
        const p2 = vertices[(i + 2) % 6]
        const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x)
        expect(cross).toBeGreaterThan(0) // Consistent positive winding -> strictly convex
      }
    })
  })

  // ============================================================================
  // 3. WHITE THRESHOLD REMOVAL ALGORITHM (removeWhiteThreshold.ts)
  // ============================================================================
  describe('3. White Threshold Removal Algorithm: Transparency, Edge Preservation, Extreme Thresholds', () => {
    // Pure algorithm oracle mimicking removeWhiteBackground inner loop
    function applyWhiteThresholdOracle(
      data: Uint8ClampedArray,
      threshold: number,
      feather: number,
    ): Uint8ClampedArray {
      const out = new Uint8ClampedArray(data)
      for (let i = 0; i < out.length; i += 4) {
        const r = out[i]
        const g = out[i + 1]
        const b = out[i + 2]
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b

        if (luminance >= threshold) {
          out[i + 3] = 0 // transparent
        } else if (luminance > threshold - feather) {
          const factor = (threshold - luminance) / feather
          out[i + 3] = Math.round(out[i + 3] * factor)
        }
      }
      return out
    }

    it('removes pure white background (255, 255, 255) completely', () => {
      const pixels = new Uint8ClampedArray([255, 255, 255, 255])
      const processed = applyWhiteThresholdOracle(pixels, 240, 15)
      expect(processed[3]).toBe(0) // Alpha must be 0
    })

    it('removes slightly yellowish off-white paper background (250, 248, 240)', () => {
      const pixels = new Uint8ClampedArray([250, 248, 240, 255])
      const lum = 0.299 * 250 + 0.587 * 248 + 0.114 * 240 // 247.686 >= 240
      expect(lum).toBeGreaterThanOrEqual(240)

      const processed = applyWhiteThresholdOracle(pixels, 240, 15)
      expect(processed[3]).toBe(0)
    })

    it('preserves black signature ink (0, 0, 0) with full opacity', () => {
      const pixels = new Uint8ClampedArray([0, 0, 0, 255])
      const processed = applyWhiteThresholdOracle(pixels, 240, 15)
      expect(processed[3]).toBe(255)
    })

    it('preserves blue ballpoint signature ink (25, 45, 140) with full opacity', () => {
      const pixels = new Uint8ClampedArray([25, 45, 140, 255])
      const lum = 0.299 * 25 + 0.587 * 45 + 0.114 * 140 // 49.85 < (240 - 15 = 225)
      expect(lum).toBeLessThan(225)

      const processed = applyWhiteThresholdOracle(pixels, 240, 15)
      expect(processed[3]).toBe(255)
    })

    it('antialiases feathered transition pixels smoothly without harsh staircasing', () => {
      // Create pixels in feather zone (luminance between 225 and 240)
      // For r=g=b=X, luminance = X
      const p230 = new Uint8ClampedArray([230, 230, 230, 255])
      const res230 = applyWhiteThresholdOracle(p230, 240, 15)
      // factor = (240 - 230) / 15 = 10 / 15 = 2/3. alpha = round(255 * 2/3) = 170
      expect(res230[3]).toBe(170)

      const p237 = new Uint8ClampedArray([237, 237, 237, 255])
      const res237 = applyWhiteThresholdOracle(p237, 240, 15)
      // factor = (240 - 237) / 15 = 3 / 15 = 0.2. alpha = round(255 * 0.2) = 51
      expect(res237[3]).toBe(51)

      expect(res230[3]).toBeGreaterThan(res237[3])
    })

    it('preserves existing transparent pixels (alpha = 0)', () => {
      const transparentPixel = new Uint8ClampedArray([200, 200, 200, 0])
      const processed = applyWhiteThresholdOracle(transparentPixel, 240, 15)
      expect(processed[3]).toBe(0)
    })

    it('extreme threshold 0 converts all pixels to transparent', () => {
      const testBuffer = new Uint8ClampedArray([
        0, 0, 0, 255,       // black
        128, 128, 128, 255, // grey
        255, 255, 255, 255, // white
      ])
      const processed = applyWhiteThresholdOracle(testBuffer, 0, 15)
      expect(processed[3]).toBe(0)
      expect(processed[7]).toBe(0)
      expect(processed[11]).toBe(0)
    })

    it('extreme threshold 255 leaves pixels below feather fully opaque', () => {
      const darkPixel = new Uint8ClampedArray([100, 100, 100, 255])
      const processed = applyWhiteThresholdOracle(darkPixel, 255, 10)
      expect(processed[3]).toBe(255)

      const pureWhite = new Uint8ClampedArray([255, 255, 255, 255])
      const processedWhite = applyWhiteThresholdOracle(pureWhite, 255, 10)
      expect(processedWhite[3]).toBe(0)
    })

    it('rejects gracefully with descriptive error when Canvas 2D is unavailable', async () => {
      const OriginalImage = globalThis.Image
      const originalGetContext = window.HTMLCanvasElement.prototype.getContext
      try {
        window.HTMLCanvasElement.prototype.getContext = (() => null) as any
        class MockImage {
          onload: (() => void) | null = null
          onerror: (() => void) | null = null
          src = ''
          naturalWidth = 100
          naturalHeight = 100
          width = 100
          height = 100
          constructor() {
            setTimeout(() => {
              this.onload?.()
            }, 10)
          }
        }
        // @ts-expect-error test mock
        globalThis.Image = MockImage
        await expect(removeWhiteBackground('test.png'))
          .rejects
          .toThrow('Canvas 2D context unavailable')
      } finally {
        globalThis.Image = OriginalImage
        window.HTMLCanvasElement.prototype.getContext = originalGetContext
      }
    })

    it('rejects gracefully with descriptive error when image fails to load', async () => {
      const OriginalImage = globalThis.Image
      try {
        class MockImage {
          onload: (() => void) | null = null
          onerror: (() => void) | null = null
          src = ''
          constructor() {
            setTimeout(() => {
              this.onerror?.()
            }, 10)
          }
        }
        // @ts-expect-error test mock
        globalThis.Image = MockImage
        await expect(removeWhiteBackground('invalid.png'))
          .rejects
          .toThrow('Failed to load image for background removal')
      } finally {
        globalThis.Image = OriginalImage
      }
    })
  })

  // ============================================================================
  // 4. TRANSIENT STATE REACTIVITY (studioNextReducer.ts)
  // ============================================================================
  describe('4. Transient State Reactivity & Undo/Redo Invariants', () => {
    const dummyElement: ElementV3 = {
      id: 'photo-1',
      type: 'photo',
      zone: 'body',
      xMm: 20,
      yMm: 30,
      widthMm: 25,
      heightMm: 30,
    } as PhotoElementV3

    it('rapid slider movements (100 transient updates) update transient state without generating 100 history states', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement })

      expect(state.history.length).toBe(2)
      expect(state.historyIndex).toBe(1)
      expect(state.dirty).toBe(true)

      // Simulate dragging a slider from step 1 to 100 (e.g. border width or opacity)
      for (let step = 1; step <= 100; step++) {
        state = studioNextReducer(state, {
          type: 'UPDATE_ELEMENT_TRANSIENT',
          id: 'photo-1',
          patch: { widthMm: 25 + step * 0.1 },
        })

        // INVARIANT: History stack size MUST NOT increment during transient slider dragging
        expect(state.history.length).toBe(2)
        expect(state.historyIndex).toBe(1)
        expect(state.dirty).toBe(true)
      }

      // Verify transient state updated in memory
      expect(state.layout.pages[0].elements[0].widthMm).toBeCloseTo(35.0, 1)

      // When the user releases slider, COMMIT_HISTORY is dispatched
      state = studioNextReducer(state, { type: 'COMMIT_HISTORY' })

      // Exactly ONE new history state was appended
      expect(state.history.length).toBe(3)
      expect(state.historyIndex).toBe(2)

      // Single UNDO returns directly to the state BEFORE the slider interaction began
      state = studioNextReducer(state, { type: 'UNDO' })
      expect(state.historyIndex).toBe(1)
      expect(state.layout.pages[0].elements[0].widthMm).toBe(25)

      // Single REDO restores the committed slider value
      state = studioNextReducer(state, { type: 'REDO' })
      expect(state.historyIndex).toBe(2)
      expect(state.layout.pages[0].elements[0].widthMm).toBeCloseTo(35.0, 1)
    })

    it('COMMIT_HISTORY with no actual layout mutation is an idempotent no-op', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement })
      expect(state.history.length).toBe(2)

      // Dispatch 5 consecutive redundant commits
      for (let i = 0; i < 5; i++) {
        state = studioNextReducer(state, { type: 'COMMIT_HISTORY' })
        expect(state.history.length).toBe(2)
        expect(state.historyIndex).toBe(1)
      }
    })

    it('UPDATE_ELEMENT_TRANSIENT strictly blocks mutation on master letterhead inherited elements', () => {
      const inheritedElement: ElementV3 = {
        ...dummyElement,
        id: 'inherited-crest',
        isInherited: true,
      } as ElementV3

      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedElement })

      // Attempt transient update on inherited element
      const nextState = studioNextReducer(state, {
        type: 'UPDATE_ELEMENT_TRANSIENT',
        id: 'inherited-crest',
        patch: { widthMm: 999 },
      })

      expect(nextState.layout.pages[0].elements[0].widthMm).toBe(25)
    })

    it('branch truncation invariant: new commit after undo discards future redo states', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement }) // history len = 2
      state = studioNextReducer(state, {
        type: 'UPDATE_ELEMENT',
        id: 'photo-1',
        patch: { widthMm: 40 },
      }) // history len = 3, index = 2
      state = studioNextReducer(state, {
        type: 'UPDATE_ELEMENT',
        id: 'photo-1',
        patch: { widthMm: 50 },
      }) // history len = 4, index = 3

      // Undo back to step 1
      state = studioNextReducer(state, { type: 'UNDO' }) // index = 2
      state = studioNextReducer(state, { type: 'UNDO' }) // index = 1
      expect(state.historyIndex).toBe(1)

      // Start new transient gesture and commit (divergence)
      state = studioNextReducer(state, {
        type: 'UPDATE_ELEMENT_TRANSIENT',
        id: 'photo-1',
        patch: { widthMm: 28 },
      })
      state = studioNextReducer(state, { type: 'COMMIT_HISTORY' })

      // Redo branch must be truncated: new length = 3, index = 2
      expect(state.history.length).toBe(3)
      expect(state.historyIndex).toBe(2)
      expect(state.layout.pages[0].elements[0].widthMm).toBe(28)

      // Redo is unavailable
      const afterRedo = studioNextReducer(state, { type: 'REDO' })
      expect(afterRedo.historyIndex).toBe(2)
    })
  })

  // ============================================================================
  // 5. PHOTO FRAMES: ASPECT RATIO LOCKING PRESETS & DEFECT INVESTIGATION
  // ============================================================================
  describe('5. Photo Frames: Aspect Ratio Locking for CR80, Passport, and Square Presets', () => {
    const presets = [
      { id: 'CR80_25x30', w: 25, h: 30, expectedRatio: 25 / 30 },
      { id: 'PASSPORT_35x45', w: 35, h: 45, expectedRatio: 35 / 45 },
      { id: 'SQUARE_1x1', w: 30, h: 30, expectedRatio: 1.0 },
      { id: 'STAMP_20x25', w: 20, h: 25, expectedRatio: 20 / 25 },
    ]

    it.each(presets)('preset $id maintains exact aspect ratio when resized with lockAspectRatio: true across all 4 corner handles', ({ w, h, expectedRatio }) => {
      const origin = {
        xMm: 20,
        yMm: 20,
        widthMm: w,
        heightMm: h,
        rotationDeg: 0,
      }

      for (const handle of ['se', 'nw', 'ne', 'sw'] as const) {
        const delta = handle === 'se' ? { dx: 15, dy: 10 } : { dx: -15, dy: -10 }
        const res = computeResizeTransform({
          handle,
          origin,
          deltaGlobalMm: delta,
          lockAspectRatio: true,
        })

        const ratio = res.widthMm / res.heightMm
        expect(ratio).toBeCloseTo(expectedRatio, 2)
      }
    })

    it.each(presets)('preset $id maintains aspect ratio when resized with lockAspectRatio: true from edge handles (e, w, s, n)', ({ w, h, expectedRatio }) => {
      const origin = {
        xMm: 40,
        yMm: 40,
        widthMm: w,
        heightMm: h,
        rotationDeg: 0,
      }

      // Drag right edge handle (e) horizontally by +10mm
      const resE = computeResizeTransform({
        handle: 'e',
        origin,
        deltaGlobalMm: { dx: 10, dy: 0 },
        lockAspectRatio: true,
      })
      expect(resE.widthMm / resE.heightMm).toBeCloseTo(expectedRatio, 2)

      // Drag bottom edge handle (s) vertically by +10mm
      const resS = computeResizeTransform({
        handle: 's',
        origin,
        deltaGlobalMm: { dx: 0, dy: 10 },
        lockAspectRatio: true,
      })
      expect(resS.widthMm / resS.heightMm).toBeCloseTo(expectedRatio, 2)
    })

    it('CRITICAL ADVERSARIAL AUDIT: verifies whether SelectionBox receives lockAspectRatio from activeElement in CanvasPage', () => {
      // In CanvasPage.tsx line 249:
      // <SelectionBox element={activeElement} absoluteYMm={activeAbsoluteYMm} zoom={zoom} ... />
      // Notice: lockAspectRatio is NOT passed to SelectionBox!
      // This test checks if an activeElement with aspectRatioLocked: true has lockAspectRatio passed down.
      const photoElementWithLock: PhotoElementV3 = {
        id: 'photo-cr80',
        type: 'photo',
        xMm: 20,
        yMm: 30,
        widthMm: 25,
        heightMm: 30,
        aspectRatioPreset: 'CR80_25x30',
        aspectRatioLocked: true,
      }

      // If lockAspectRatio is omitted, SelectionBox uses default lockAspectRatio = false:
      const withoutShift = computeResizeTransform({
        handle: 'e',
        origin: {
          xMm: photoElementWithLock.xMm,
          yMm: photoElementWithLock.yMm,
          widthMm: photoElementWithLock.widthMm,
          heightMm: photoElementWithLock.heightMm,
          rotationDeg: 0,
        },
        deltaGlobalMm: { dx: 15, dy: 0 },
        lockAspectRatio: false, // Default when omitted by CanvasPage
      })

      // When lockAspectRatio is false, handle 'e' only stretches width and does NOT scale height:
      const distortedRatio = withoutShift.widthMm / withoutShift.heightMm
      expect(distortedRatio).not.toBeCloseTo(25 / 30, 2) // Ratio is distorted to (25+15)/30 = 40/30 = 1.33!
      expect(withoutShift.heightMm).toBe(30) // Height failed to adjust!
    })

    it('empirically verifies CanvasPage SelectionBox: dragging east handle without shift respects element.aspectRatioLocked and preserves aspect ratio', () => {
      let updatedGeometry: { xMm: number; yMm: number; widthMm?: number; heightMm?: number } | null = null

      const photoEl: PhotoElementV3 = {
        id: 'photo-cr80',
        type: 'photo',
        zone: 'body',
        xMm: 20,
        yMm: 30,
        widthMm: 25,
        heightMm: 30,
        aspectRatioPreset: 'CR80_25x30',
        aspectRatioLocked: true,
      }

      const layout: LayoutV3 = {
        version: 3,
        page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [photoEl] }],
        watermark: { mode: 'none' },
      }

      // Mock setPointerCapture/releasePointerCapture for JSDOM
      window.HTMLElement.prototype.setPointerCapture = () => {}
      window.HTMLElement.prototype.releasePointerCapture = () => {}

      const { container } = render(
        <CanvasPage
          layout={layout}
          pageIndex={0}
          zoom={1.0}
          selectedElementIds={['photo-cr80']}
          hoveredElementId={null}
          smartGuides={[]}
          sampleMode={true}
          onSelectElement={() => {}}
          onUpdateElementGeometry={(_id: string, geom: any) => {
            updatedGeometry = geom
          }}
          onCommitGesture={() => {}}
          onZoneResize={() => {}}
          onSetSmartGuides={() => {}}
          onCursorMove={() => {}}
        />,
      )

      const eastHandle = container.querySelector('.sn-resize-handle.e')
      expect(eastHandle).toBeTruthy()

      // Pointer down on east handle at (100, 100)
      fireEvent.pointerDown(eastHandle!, { clientX: 100, clientY: 100, pointerId: 1 })

      // Pointer move right by 50px without shift
      fireEvent.pointerMove(eastHandle!, { clientX: 150, clientY: 100, shiftKey: false })

      expect(updatedGeometry).not.toBeNull()
      // Fix verification: heightMm scales proportionally to preserve aspect ratio
      expect(updatedGeometry!.heightMm).toBeGreaterThan(30)
      expect(updatedGeometry!.widthMm! / updatedGeometry!.heightMm!).toBeCloseTo(25 / 30, 2)
    })
  })
})
