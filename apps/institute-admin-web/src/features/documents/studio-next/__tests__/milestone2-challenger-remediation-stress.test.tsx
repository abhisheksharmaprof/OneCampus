import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  computeAutoFitFontSize,
  type LayoutV3,
  type PhotoElementV3,
  type ImageElementV3,
  type TextElementV3,
} from '@campusone/document-engine'
import { render, fireEvent } from '@testing-library/react'
import { CanvasPage } from '../canvas/CanvasPage'
import { computeResizeTransform } from '../math/handles'

describe('Empirical Adversarial Verification - Milestone 2 Iteration 2 (Remediation)', () => {
  // ==========================================================================
  // SECTION 1: AUTO-FIT ENGINE NON-POSITIVE BOUNDS EMPIRICAL STRESS
  // ==========================================================================
  describe('1. Auto-Fit Engine: Non-Positive Dimensions & Padding Consumption', () => {
    it('returns overflows: true and isOverflow: true when widthMm = 0 and heightMm = 0 (object style)', () => {
      const res = computeAutoFitFontSize({
        text: 'Standard student name or certificate text',
        widthMm: 0,
        heightMm: 0,
        baseFontSizePt: 14,
        minFontSizePt: 6,
      })

      expect(res.overflows).toBe(true)
      expect(res.isOverflow).toBe(true)
      expect(res.fontSizePt).toBe(6)
      expect(res.fittedFontSizePt).toBe(6)
      expect(res.estimatedHeightMm).toBe(9999)
    })

    it('returns overflows: true and isOverflow: true when widthMm = 0 or heightMm = 0 independently', () => {
      const resZeroW = computeAutoFitFontSize({
        text: 'Academic Transcript',
        widthMm: 0,
        heightMm: 50,
      })
      expect(resZeroW.overflows).toBe(true)
      expect(resZeroW.isOverflow).toBe(true)

      const resZeroH = computeAutoFitFontSize({
        text: 'Academic Transcript',
        widthMm: 50,
        heightMm: 0,
      })
      expect(resZeroH.overflows).toBe(true)
      expect(resZeroH.isOverflow).toBe(true)
    })

    it('returns overflows: true and isOverflow: true for negative dimensions', () => {
      const negativeTestCases = [
        { desc: 'negative widthMm (-10)', opts: { text: 'Test', widthMm: -10, heightMm: 30 } },
        { desc: 'negative heightMm (-25)', opts: { text: 'Test', widthMm: 40, heightMm: -25 } },
        { desc: 'both negative (-5, -5)', opts: { text: 'Test', widthMm: -5, heightMm: -5 } },
        { desc: 'tiny negative widthMm (-0.0001)', opts: { text: 'Test', widthMm: -0.0001, heightMm: 10 } },
        { desc: 'tiny negative heightMm (-0.0001)', opts: { text: 'Test', widthMm: 10, heightMm: -0.0001 } },
      ]

      for (const tc of negativeTestCases) {
        const res = computeAutoFitFontSize(tc.opts)
        expect(res.overflows).toBe(true)
        expect(res.isOverflow).toBe(true)
        expect(res.fontSizePt).toBe((tc.opts as { minFontSizePt?: number }).minFontSizePt ?? 6)
      }
    })

    it('returns overflows: true and isOverflow: true when box is completely consumed by padding (paddingMm * 2 >= dimension)', () => {
      // 1. paddingMm * 2 exactly equals widthMm (availableWidthMm = 0)
      const resExactW = computeAutoFitFontSize({
        text: 'Student Profile',
        widthMm: 20,
        heightMm: 40,
        paddingMm: 10, // 20 - 20 = 0 available width
      })
      expect(resExactW.overflows).toBe(true)
      expect(resExactW.isOverflow).toBe(true)

      // 2. paddingMm * 2 strictly exceeds widthMm (availableWidthMm < 0)
      const resExceedsW = computeAutoFitFontSize({
        text: 'Student Profile',
        widthMm: 20,
        heightMm: 40,
        paddingMm: 12, // 20 - 24 = -4 available width
      })
      expect(resExceedsW.overflows).toBe(true)
      expect(resExceedsW.isOverflow).toBe(true)

      // 3. paddingMm * 2 exactly equals heightMm (availableHeightMm = 0)
      const resExactH = computeAutoFitFontSize({
        text: 'Student Profile',
        widthMm: 60,
        heightMm: 30,
        paddingMm: 15, // 30 - 30 = 0 available height
      })
      expect(resExactH.overflows).toBe(true)
      expect(resExactH.isOverflow).toBe(true)

      // 4. paddingMm * 2 strictly exceeds heightMm (availableHeightMm < 0)
      const resExceedsH = computeAutoFitFontSize({
        text: 'Student Profile',
        widthMm: 60,
        heightMm: 30,
        paddingMm: 16, // 30 - 32 = -2 available height
      })
      expect(resExceedsH.overflows).toBe(true)
      expect(resExceedsH.isOverflow).toBe(true)

      // 5. Massive padding completely swamping small box
      const resSwamped = computeAutoFitFontSize({
        text: 'Tiny Box',
        widthMm: 5,
        heightMm: 5,
        paddingMm: 100,
      })
      expect(resSwamped.overflows).toBe(true)
      expect(resSwamped.isOverflow).toBe(true)
    })

    it('returns overflows: true and isOverflow: true even with empty or whitespace strings when bounds are non-positive', () => {
      // Empty string in zero box must still flag overflow because box cannot host text
      const resEmptyZero = computeAutoFitFontSize({
        text: '',
        widthMm: 0,
        heightMm: 0,
      })
      expect(resEmptyZero.overflows).toBe(true)
      expect(resEmptyZero.isOverflow).toBe(true)

      const resWhitespaceZero = computeAutoFitFontSize({
        text: '   \n\t  ',
        widthMm: -5,
        heightMm: 10,
      })
      expect(resWhitespaceZero.overflows).toBe(true)
      expect(resWhitespaceZero.isOverflow).toBe(true)

      const resEmptySwamped = computeAutoFitFontSize({
        text: '',
        widthMm: 10,
        heightMm: 10,
        paddingMm: 10,
      })
      expect(resEmptySwamped.overflows).toBe(true)
      expect(resEmptySwamped.isOverflow).toBe(true)
    })

    it('supports positional arguments style with non-positive dimensions', () => {
      const resPosZero = computeAutoFitFontSize('Sample text', { fontSizePt: 14 }, 0, 0, 6)
      expect(resPosZero.overflows).toBe(true)
      expect(resPosZero.isOverflow).toBe(true)

      const resPosNegW = computeAutoFitFontSize('Sample text', { fontSizePt: 14 }, -10, 50, 6)
      expect(resPosNegW.overflows).toBe(true)
      expect(resPosNegW.isOverflow).toBe(true)

      const resPosNegH = computeAutoFitFontSize('Sample text', { fontSizePt: 14 }, 50, -10, 6)
      expect(resPosNegH.overflows).toBe(true)
      expect(resPosNegH.isOverflow).toBe(true)
    })

    it('property-based generator: 200 randomized non-positive/consumed bound combinations strictly overflow', () => {
      for (let i = 0; i < 200; i++) {
        const scenario = i % 4
        let w = 10, h = 10, p = 0

        if (scenario === 0) {
          w = 0
          h = Math.random() * 100
        } else if (scenario === 1) {
          w = Math.random() * 100
          h = 0
        } else if (scenario === 2) {
          w = -(Math.random() * 50 + 0.1)
          h = Math.random() * 50
        } else {
          w = Math.random() * 50 + 5
          h = Math.random() * 50 + 5
          p = Math.min(w, h) / 2 + (Math.random() * 10)
        }

        const res = computeAutoFitFontSize({
          text: `Sample string iteration ${i}`,
          widthMm: w,
          heightMm: h,
          paddingMm: p,
        })

        expect(res.overflows).toBe(true)
        expect(res.isOverflow).toBe(true)
      }
    })
  })

  // ==========================================================================
  // SECTION 2: STUDIO CANVAS ASPECT RATIO LOCKING EMPIRICAL STRESS
  // ==========================================================================
  describe('2. CanvasPage & SelectionBox: Aspect Ratio Locking Across All 8 Resize Handles', () => {
    // Setup standard mock for DOM PointerCapture
    window.HTMLElement.prototype.setPointerCapture = () => {}
    window.HTMLElement.prototype.releasePointerCapture = () => {}

    const photoPresetRatio = 30 / 40 // 0.75 (3:4 portrait photo)
    const initialPhoto: PhotoElementV3 = {
      id: 'photo-test-student',
      type: 'photo',
      zone: 'body',
      xMm: 25,
      yMm: 35,
      widthMm: 30,
      heightMm: 40,
      aspectRatioPreset: 'CR80_25x30',
      aspectRatioLocked: true,
      fieldId: 'student_photo',
      fallbackInitials: 'ST',
    }

    const testLayout: LayoutV3 = {
      version: 3,
      page: {
        sizeId: 'A4P',
        orientation: 'PORTRAIT',
        marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      },
      zones: { headerMm: 30, footerMm: 20 },
      pages: [{ id: 'p1', elements: [initialPhoto] }],
      watermark: { mode: 'none' },
    }

    const allHandles = ['e', 'w', 'n', 's', 'se', 'sw', 'ne', 'nw'] as const

    for (const handle of allHandles) {
      it(`CanvasPage strictly preserves photo aspect ratio when dragging handle "${handle}" without Shift`, () => {
        let lastUpdatedGeometry: { xMm: number; yMm: number; widthMm?: number; heightMm?: number } | null = null

        const { container } = render(
          <CanvasPage
            layout={testLayout}
            pageIndex={0}
            zoom={1.0}
            selectedElementIds={['photo-test-student']}
            hoveredElementId={null}
            smartGuides={[]}
            sampleMode={true}
            onSelectElement={() => {}}
            onUpdateElementGeometry={(_id: string, geom: any) => {
              lastUpdatedGeometry = geom
            }}
            onCommitGesture={() => {}}
            onZoneResize={() => {}}
            onSetSmartGuides={() => {}}
            onCursorMove={() => {}}
          />,
        )

        const handleElement = container.querySelector(`.sn-resize-handle.${handle}`)
        expect(handleElement).not.toBeNull()

        // Pointer down on the handle at (200, 200)
        fireEvent.pointerDown(handleElement!, { clientX: 200, clientY: 200, pointerId: 1 })

        // Pointer move without shift:
        // Move with handle-appropriate direction to ensure positive expansion
        let deltaX = 0
        let deltaY = 0

        switch (handle) {
          case 'e': deltaX = 40; deltaY = 0; break
          case 'w': deltaX = -40; deltaY = 0; break
          case 's': deltaX = 0; deltaY = 40; break
          case 'n': deltaX = 0; deltaY = -40; break
          case 'se': deltaX = 40; deltaY = 40; break
          case 'sw': deltaX = -40; deltaY = 40; break
          case 'ne': deltaX = 40; deltaY = -40; break
          case 'nw': deltaX = -40; deltaY = -40; break
        }

        fireEvent.pointerMove(handleElement!, {
          clientX: 200 + deltaX,
          clientY: 200 + deltaY,
          shiftKey: false, // NO SHIFT! Must lock aspect ratio autonomously
        })

        expect(lastUpdatedGeometry).not.toBeNull()
        expect(lastUpdatedGeometry!.widthMm).toBeDefined()
        expect(lastUpdatedGeometry!.heightMm).toBeDefined()

        const resultingRatio = lastUpdatedGeometry!.widthMm! / lastUpdatedGeometry!.heightMm!
        expect(resultingRatio).toBeCloseTo(photoPresetRatio, 2)
      })
    }

    it('CanvasPage preserves aspect ratio for photo elements even when aspectRatioLocked is NOT explicitly set', () => {
      // PhotoElement with aspectRatioLocked omitted/undefined:
      const photoWithoutExplicitLock: PhotoElementV3 = {
        id: 'photo-implicit-lock',
        type: 'photo',
        zone: 'body',
        xMm: 20,
        yMm: 20,
        widthMm: 35,
        heightMm: 45, // Passport photo 35:45 ~ 0.7778
        fieldId: 'student_photo',
      }

      const layoutImplicit: LayoutV3 = {
        version: 3,
        page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [photoWithoutExplicitLock] }],
        watermark: { mode: 'none' },
      }

      let updatedGeom: any = null
      const { container } = render(
        <CanvasPage
          layout={layoutImplicit}
          pageIndex={0}
          zoom={1.0}
          selectedElementIds={['photo-implicit-lock']}
          hoveredElementId={null}
          smartGuides={[]}
          sampleMode={true}
          onSelectElement={() => {}}
          onUpdateElementGeometry={(_id: string, geom: any) => {
            updatedGeom = geom
          }}
          onCommitGesture={() => {}}
          onZoneResize={() => {}}
          onSetSmartGuides={() => {}}
          onCursorMove={() => {}}
        />,
      )

      const eastHandle = container.querySelector('.sn-resize-handle.e')
      expect(eastHandle).not.toBeNull()

      fireEvent.pointerDown(eastHandle!, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerMove(eastHandle!, { clientX: 150, clientY: 100, shiftKey: false })

      expect(updatedGeom).not.toBeNull()
      const ratio = updatedGeom.widthMm / updatedGeom.heightMm
      expect(ratio).toBeCloseTo(35 / 45, 2)
    })

    it('CanvasPage preserves aspect ratio for non-photo elements when aspectRatioLocked is true', () => {
      // Image element with aspectRatioLocked: true
      const lockedImage: ImageElementV3 = {
        id: 'image-locked',
        type: 'image',
        zone: 'body',
        xMm: 40,
        yMm: 40,
        widthMm: 50,
        heightMm: 25, // 2:1 aspect ratio
        aspectRatioLocked: true,
      }

      const layoutImage: LayoutV3 = {
        version: 3,
        page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [lockedImage] }],
        watermark: { mode: 'none' },
      }

      let updatedGeom: any = null
      const { container } = render(
        <CanvasPage
          layout={layoutImage}
          pageIndex={0}
          zoom={1.0}
          selectedElementIds={['image-locked']}
          hoveredElementId={null}
          smartGuides={[]}
          sampleMode={true}
          onSelectElement={() => {}}
          onUpdateElementGeometry={(_id: string, geom: any) => {
            updatedGeom = geom
          }}
          onCommitGesture={() => {}}
          onZoneResize={() => {}}
          onSetSmartGuides={() => {}}
          onCursorMove={() => {}}
        />,
      )

      // Test south handle dragging on 2:1 image
      const southHandle = container.querySelector('.sn-resize-handle.s')
      expect(southHandle).not.toBeNull()

      fireEvent.pointerDown(southHandle!, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerMove(southHandle!, { clientX: 100, clientY: 140, shiftKey: false })

      expect(updatedGeom).not.toBeNull()
      // South handle expansion should widen width proportionally to maintain 2:1 ratio
      const ratio = updatedGeom.widthMm / updatedGeom.heightMm
      expect(ratio).toBeCloseTo(50 / 25, 2)
    })

    it('NEGATIVE CONTROL: Text element without aspectRatioLocked does NOT lock aspect ratio when resized without Shift', () => {
      const regularText: TextElementV3 = {
        id: 'text-unlocked',
        type: 'text',
        zone: 'body',
        xMm: 10,
        yMm: 10,
        widthMm: 60,
        heightMm: 20,
        runs: [{ text: 'Dynamic Header' }],
      }

      const layoutText: LayoutV3 = {
        version: 3,
        page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [regularText] }],
        watermark: { mode: 'none' },
      }

      let updatedGeom: any = null
      const { container } = render(
        <CanvasPage
          layout={layoutText}
          pageIndex={0}
          zoom={1.0}
          selectedElementIds={['text-unlocked']}
          hoveredElementId={null}
          smartGuides={[]}
          sampleMode={true}
          onSelectElement={() => {}}
          onUpdateElementGeometry={(_id: string, geom: any) => {
            updatedGeom = geom
          }}
          onCommitGesture={() => {}}
          onZoneResize={() => {}}
          onSetSmartGuides={() => {}}
          onCursorMove={() => {}}
        />,
      )

      const eastHandle = container.querySelector('.sn-resize-handle.e')
      expect(eastHandle).not.toBeNull()

      fireEvent.pointerDown(eastHandle!, { clientX: 100, clientY: 100, pointerId: 1 })
      // Move east handle right by 50px
      fireEvent.pointerMove(eastHandle!, { clientX: 150, clientY: 100, shiftKey: false })

      expect(updatedGeom).not.toBeNull()
      // For unlocked text element, dragging east changes width but leaves height UNCHANGED at 20
      expect(updatedGeom.heightMm).toBe(20)
      expect(updatedGeom.widthMm).toBeGreaterThan(60)
      // Ratio is changed from 60/20 (3.0) to > 3.0
      expect(updatedGeom.widthMm / updatedGeom.heightMm).not.toBeCloseTo(60 / 20, 2)
    })
  })
})
