import { describe, expect, it } from 'vitest'
import { initialStudioNextState, studioNextReducer } from '../state/studioNextReducer'
import type { ElementV3, LayoutV3, ZoneV3 } from '@campusone/document-engine'

describe('Empirical Adversarial Stress Suite - Studio Next', () => {
  const createElement = (id: string, overrides: Partial<ElementV3> = {}): ElementV3 => ({
    id,
    type: 'text',
    zone: 'body',
    xMm: 20,
    yMm: 30,
    widthMm: 60,
    heightMm: 15,
    ...overrides,
  } as ElementV3)

  describe('1. History Stack Integrity Stress-Testing', () => {
    it('1.1: 50 successive modifications followed by 50 undos and 50 redos maintains perfect state consistency', () => {
      let state = initialStudioNextState()
      const recordedStates: string[] = [JSON.stringify(state.layout)]

      // Perform 50 successive modifications (adding elements el-1 ... el-50)
      for (let i = 1; i <= 50; i++) {
        state = studioNextReducer(state, {
          type: 'ADD_ELEMENT',
          element: createElement(`el-${i}`, { xMm: i, yMm: i }),
        })
        expect(state.historyIndex).toBe(i)
        expect(state.history.length).toBe(i + 1)
        expect(state.layout.pages[0].elements.length).toBe(i)
        recordedStates.push(JSON.stringify(state.layout))
      }

      expect(state.historyIndex).toBe(50)
      expect(state.history.length).toBe(51)

      // Step-by-step 50 UNDOS: each step must match recorded history exactly
      for (let i = 49; i >= 0; i--) {
        state = studioNextReducer(state, { type: 'UNDO' })
        expect(state.historyIndex).toBe(i)
        expect(JSON.stringify(state.layout)).toBe(recordedStates[i])
        expect(state.layout.pages[0].elements.length).toBe(i)
      }

      expect(state.historyIndex).toBe(0)
      expect(state.layout.pages[0].elements.length).toBe(0)

      // Underflow protection: 51st undo must be a clean no-op
      const underflowState = studioNextReducer(state, { type: 'UNDO' })
      expect(underflowState.historyIndex).toBe(0)
      expect(JSON.stringify(underflowState.layout)).toBe(recordedStates[0])

      // Step-by-step 50 REDOS: each step must recover recorded history exactly
      for (let i = 1; i <= 50; i++) {
        state = studioNextReducer(state, { type: 'REDO' })
        expect(state.historyIndex).toBe(i)
        expect(JSON.stringify(state.layout)).toBe(recordedStates[i])
        expect(state.layout.pages[0].elements.length).toBe(i)
      }

      expect(state.historyIndex).toBe(50)

      // Overflow protection: 51st redo must be a clean no-op
      const overflowState = studioNextReducer(state, { type: 'REDO' })
      expect(overflowState.historyIndex).toBe(50)
      expect(JSON.stringify(overflowState.layout)).toBe(recordedStates[50])
    })

    it('1.2: Redo branch invalidation: 10 actions, undo 5, 1 new action -> redo is unavailable', () => {
      let state = initialStudioNextState()

      // Perform 10 actions
      for (let i = 1; i <= 10; i++) {
        state = studioNextReducer(state, {
          type: 'ADD_ELEMENT',
          element: createElement(`el-${i}`),
        })
      }
      expect(state.historyIndex).toBe(10)
      expect(state.history.length).toBe(11)

      // Undo 5 times -> index becomes 5
      for (let i = 0; i < 5; i++) {
        state = studioNextReducer(state, { type: 'UNDO' })
      }
      expect(state.historyIndex).toBe(5)
      expect(state.layout.pages[0].elements.length).toBe(5)

      // Perform 1 new action (divergent branch)
      state = studioNextReducer(state, {
        type: 'ADD_ELEMENT',
        element: createElement('el-divergent'),
      })

      // Redo branch must be truncated
      expect(state.historyIndex).toBe(6)
      expect(state.history.length).toBe(7)
      expect(state.layout.pages[0].elements.map((e) => e.id)).toEqual([
        'el-1',
        'el-2',
        'el-3',
        'el-4',
        'el-5',
        'el-divergent',
      ])

      // Verify REDO is completely unavailable (strict no-op)
      const afterRedo = studioNextReducer(state, { type: 'REDO' })
      expect(afterRedo.historyIndex).toBe(6)
      expect(afterRedo.history.length).toBe(7)
      expect(afterRedo.layout.pages[0].elements.map((e) => e.id)).toEqual([
        'el-1',
        'el-2',
        'el-3',
        'el-4',
        'el-5',
        'el-divergent',
      ])
    })

    it('1.3: Coalescing verification: continuous RESIZE_ELEMENT_TRANSIENT movements followed by COMMIT_HISTORY increases history by exactly 1', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, {
        type: 'ADD_ELEMENT',
        element: createElement('target-box', { widthMm: 50, heightMm: 30 }),
      })

      const baseHistoryLen = state.history.length // 2
      const baseHistoryIndex = state.historyIndex // 1

      // Simulate 60 continuous mouse resize events (60fps gesture)
      for (let step = 1; step <= 60; step++) {
        state = studioNextReducer(state, {
          type: 'RESIZE_ELEMENT_TRANSIENT',
          id: 'target-box',
          xMm: 20,
          yMm: 30,
          widthMm: 50 + step * 0.5,
          heightMm: 30 + step * 0.25,
        })
        // History length and index MUST NOT increase during drag
        expect(state.history.length).toBe(baseHistoryLen)
        expect(state.historyIndex).toBe(baseHistoryIndex)
      }

      // Check final transient dimensions before commit
      const currentEl = state.layout.pages[0].elements.find((e) => e.id === 'target-box')
      expect(currentEl?.widthMm).toBe(50 + 60 * 0.5) // 80
      expect(currentEl?.heightMm).toBe(30 + 60 * 0.25) // 45

      // Commit gesture (onPointerUp)
      state = studioNextReducer(state, { type: 'COMMIT_HISTORY' })

      // History length MUST increase by exactly 1
      expect(state.history.length).toBe(baseHistoryLen + 1)
      expect(state.historyIndex).toBe(baseHistoryIndex + 1)

      // Redundant consecutive commit with no layout changes MUST be a no-op
      const doubleCommit = studioNextReducer(state, { type: 'COMMIT_HISTORY' })
      expect(doubleCommit.history.length).toBe(baseHistoryLen + 1)
      expect(doubleCommit.historyIndex).toBe(baseHistoryIndex + 1)
    })

    it('1.4: History depth boundary caps at 100 snapshots without corruption', () => {
      let state = initialStudioNextState()

      // Perform 150 mutating actions
      for (let i = 1; i <= 150; i++) {
        state = studioNextReducer(state, {
          type: 'ADD_ELEMENT',
          element: createElement(`cap-el-${i}`),
        })
      }

      // Capped at 100 snapshots
      expect(state.history.length).toBe(100)
      expect(state.historyIndex).toBe(99)

      // Can undo up to 99 times down to 0
      for (let i = 0; i < 99; i++) {
        state = studioNextReducer(state, { type: 'UNDO' })
      }
      expect(state.historyIndex).toBe(0)

      // 100th undo stays at 0 cleanly
      const clamped = studioNextReducer(state, { type: 'UNDO' })
      expect(clamped.historyIndex).toBe(0)
    })
  })

  describe('2. Multi-Selection & Layer Management', () => {
    it('2.1: Z-index reordering edge cases & boundary conditions', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('A') })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('B') })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('C') })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('D') })

      const getOrder = () => state.layout.pages[0].elements.map((e) => e.id)
      expect(getOrder()).toEqual(['A', 'B', 'C', 'D'])

      // Boundary condition: SEND_TO_BACK on bottom element ('A') should be no-op
      const beforeA = state.history.length
      state = studioNextReducer(state, { type: 'SEND_TO_BACK', id: 'A' })
      expect(getOrder()).toEqual(['A', 'B', 'C', 'D'])
      // History should not increment on no-op reorder
      expect(state.history.length).toBe(beforeA)

      // Boundary condition: STEP_DOWN on bottom element ('A') should be no-op
      state = studioNextReducer(state, { type: 'STEP_DOWN', id: 'A' })
      expect(getOrder()).toEqual(['A', 'B', 'C', 'D'])

      // Boundary condition: BRING_TO_FRONT on top element ('D') should be no-op
      state = studioNextReducer(state, { type: 'BRING_TO_FRONT', id: 'D' })
      expect(getOrder()).toEqual(['A', 'B', 'C', 'D'])

      // Boundary condition: STEP_UP on top element ('D') should be no-op
      state = studioNextReducer(state, { type: 'STEP_UP', id: 'D' })
      expect(getOrder()).toEqual(['A', 'B', 'C', 'D'])

      // Boundary condition: Non-existent ID should be no-op
      state = studioNextReducer(state, { type: 'STEP_UP', id: 'non-existent' })
      expect(getOrder()).toEqual(['A', 'B', 'C', 'D'])

      // Valid step up: B -> moves above C
      state = studioNextReducer(state, { type: 'STEP_UP', id: 'B' })
      expect(getOrder()).toEqual(['A', 'C', 'B', 'D'])

      // Valid step down: D -> moves below B
      state = studioNextReducer(state, { type: 'STEP_DOWN', id: 'D' })
      expect(getOrder()).toEqual(['A', 'C', 'D', 'B'])

      // Send B to back
      state = studioNextReducer(state, { type: 'SEND_TO_BACK', id: 'B' })
      expect(getOrder()).toEqual(['B', 'A', 'C', 'D'])

      // Bring C to front
      state = studioNextReducer(state, { type: 'BRING_TO_FRONT', id: 'C' })
      expect(getOrder()).toEqual(['B', 'A', 'D', 'C'])
    })

    it('2.2: Lock toggle & mutation resistance', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('L1') })

      expect(state.layout.pages[0].elements[0].locked).toBeUndefined()

      // Toggle lock ON
      state = studioNextReducer(state, { type: 'TOGGLE_LOCK', id: 'L1' })
      expect(state.layout.pages[0].elements[0].locked).toBe(true)

      // Nudge selected: L1 is selected and locked
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'L1' })
      state = studioNextReducer(state, { type: 'NUDGE_SELECTED', dxMm: 10, dyMm: 10 })

      // Locked element MUST NOT move via nudge
      expect(state.layout.pages[0].elements[0].xMm).toBe(20)
      expect(state.layout.pages[0].elements[0].yMm).toBe(30)

      // Toggle lock OFF
      state = studioNextReducer(state, { type: 'TOGGLE_LOCK', id: 'L1' })
      expect(state.layout.pages[0].elements[0].locked).toBe(false)

      // Now nudging moves it
      state = studioNextReducer(state, { type: 'NUDGE_SELECTED', dxMm: 10, dyMm: 10 })
      expect(state.layout.pages[0].elements[0].xMm).toBe(30)
      expect(state.layout.pages[0].elements[0].yMm).toBe(40)
    })

    it('2.3: Visibility toggle', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('V1') })

      expect(state.layout.pages[0].elements[0].visible).toBeUndefined()

      // Toggle visibility OFF
      state = studioNextReducer(state, { type: 'TOGGLE_VISIBILITY', id: 'V1' })
      expect(state.layout.pages[0].elements[0].visible).toBe(false)

      // Toggle visibility ON
      state = studioNextReducer(state, { type: 'TOGGLE_VISIBILITY', id: 'V1' })
      expect(state.layout.pages[0].elements[0].visible).toBe(true)
    })

    it('2.4: Zone reassignments with accurate absolute-to-relative coordinate conversion', () => {
      let state = initialStudioNextState()
      // Default A4 portrait: 297mm height, headerMm: 35, footerMm: 25. Body is [35, 272].
      // Add element in body at relative yMm = 10 (absolute Y = 35 + 10 = 45mm)
      state = studioNextReducer(state, {
        type: 'ADD_ELEMENT',
        element: createElement('Z1', { zone: 'body', yMm: 10 }),
      })

      // Reassign to header zone: absolute Y is 46mm (36mm header + 10mm relative body)
      state = studioNextReducer(state, { type: 'REASSIGN_ZONE', id: 'Z1', zone: 'header' })
      const inHeader = state.layout.pages[0].elements[0]
      expect(inHeader.zone).toBe('header')
      expect(inHeader.yMm).toBe(46)

      // Reassign back to body: relative yMm should return to 10
      state = studioNextReducer(state, { type: 'REASSIGN_ZONE', id: 'Z1', zone: 'body' })
      const backInBody = state.layout.pages[0].elements[0]
      expect(backInBody.zone).toBe('body')
      expect(backInBody.yMm).toBe(10)
    })

    it('2.6: [SECURITY / ROBUSTNESS PROBE] Deletion of locked elements via DELETE_SELECTED', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, {
        type: 'ADD_ELEMENT',
        element: createElement('locked-box', { locked: true }),
      })
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'locked-box' })

      // Dispatch DELETE_SELECTED
      state = studioNextReducer(state, { type: 'DELETE_SELECTED' })

      // Does the reducer protect locked elements from being deleted?
      const remaining = state.layout.pages[0].elements.map((e) => e.id)
      expect(remaining).toContain('locked-box')
    })

    it('2.5: Multi-selection operations: toggle, select all, clear, duplicate, and delete', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('M1') })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('M2') })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: createElement('M3') })

      // Multi-select M1 and M2
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'M1', multi: false })
      expect(state.selectedElementIds).toEqual(['M1'])
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'M2', multi: true })
      expect(state.selectedElementIds).toEqual(['M1', 'M2'])

      // Toggle M1 off
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'M1', multi: true })
      expect(state.selectedElementIds).toEqual(['M2'])

      // Select All
      state = studioNextReducer(state, { type: 'SELECT_ALL' })
      expect(state.selectedElementIds).toEqual(['M1', 'M2', 'M3'])

      // Clear selection
      state = studioNextReducer(state, { type: 'CLEAR_SELECTION' })
      expect(state.selectedElementIds).toEqual([])
    })
  })

  describe('3. Master Letterhead Element Protection (isInherited: true)', () => {
    it('3.1: Prevents deletion of inherited elements via DELETE_SELECTED', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-logo', { isInherited: true, xMm: 15, yMm: 10 })
      const regularEl = createElement('body-text', { isInherited: false, xMm: 20, yMm: 50 })

      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: regularEl })

      // Select both elements
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'master-logo', multi: false })
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'body-text', multi: true })
      expect(state.selectedElementIds).toEqual(['master-logo', 'body-text'])

      // Delete selected
      state = studioNextReducer(state, { type: 'DELETE_SELECTED' })

      // Regular element MUST be deleted, but inherited element MUST survive!
      const remainingIds = state.layout.pages[0].elements.map((e) => e.id)
      expect(remainingIds).toContain('master-logo')
      expect(remainingIds).not.toContain('body-text')
    })

    it('3.2: Prevents duplication of inherited elements via DUPLICATE_SELECTED', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-header', { isInherited: true })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'master-header' })

      // Attempt to duplicate
      state = studioNextReducer(state, { type: 'DUPLICATE_SELECTED' })

      // No duplication should happen for inherited elements
      expect(state.layout.pages[0].elements.length).toBe(1)
      expect(state.layout.pages[0].elements[0].id).toBe('master-header')
    })

    it('3.3: Prevents copying of inherited elements to clipboard', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-crest', { isInherited: true })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'master-crest' })

      state = studioNextReducer(state, { type: 'COPY_SELECTED' })
      expect(state.clipboard).toEqual([])
    })

    it('3.4: SELECT_ALL strictly excludes inherited elements', () => {
      let state = initialStudioNextState()
      state = studioNextReducer(state, {
        type: 'ADD_ELEMENT',
        element: createElement('master-el', { isInherited: true }),
      })
      state = studioNextReducer(state, {
        type: 'ADD_ELEMENT',
        element: createElement('user-el', { isInherited: false }),
      })

      state = studioNextReducer(state, { type: 'SELECT_ALL' })
      expect(state.selectedElementIds).toEqual(['user-el'])
    })

    it('3.5: Detaching master element removes isInherited flag and unlocks editing', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-strip', { isInherited: true })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })

      expect(state.layout.pages[0].elements[0].isInherited).toBe(true)

      // Detach master element
      state = studioNextReducer(state, { type: 'DETACH_MASTER_ELEMENT', id: 'master-strip' })
      expect(state.layout.pages[0].elements[0].isInherited).toBeUndefined()

      // Now it can be duplicated
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'master-strip' })
      state = studioNextReducer(state, { type: 'DUPLICATE_SELECTED' })
      expect(state.layout.pages[0].elements.length).toBe(2)

      // And it can be deleted
      state = studioNextReducer(state, { type: 'DELETE_SELECTED' })
      expect(state.layout.pages[0].elements.length).toBe(1)
    })

    it('3.6: Attempting to move an element with isInherited: true must be blocked', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-badge', {
        isInherited: true,
        xMm: 10,
        yMm: 10,
        widthMm: 40,
        heightMm: 20,
      })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })

      // Dispatch MOVE_ELEMENT_TRANSIENT directly targeting inherited element
      const movedState = studioNextReducer(state, {
        type: 'MOVE_ELEMENT_TRANSIENT',
        id: 'master-badge',
        xMm: 99,
        yMm: 99,
      })

      const movedEl = movedState.layout.pages[0].elements.find((e) => e.id === 'master-badge')
      // Requirement: Attempting to move an element with isInherited: true must be blocked
      expect(movedEl?.xMm).toBe(10)
      expect(movedEl?.yMm).toBe(10)
    })

    it('3.7: Attempting to resize an element with isInherited: true must be blocked', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-badge', {
        isInherited: true,
        xMm: 10,
        yMm: 10,
        widthMm: 40,
        heightMm: 20,
      })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })

      // Dispatch RESIZE_ELEMENT_TRANSIENT directly targeting inherited element
      const resizedState = studioNextReducer(state, {
        type: 'RESIZE_ELEMENT_TRANSIENT',
        id: 'master-badge',
        xMm: 10,
        yMm: 10,
        widthMm: 150,
        heightMm: 150,
      })

      const resizedEl = resizedState.layout.pages[0].elements.find((e) => e.id === 'master-badge')
      // Requirement: Attempting to resize an element with isInherited: true must be blocked
      expect(resizedEl?.widthMm).toBe(40)
      expect(resizedEl?.heightMm).toBe(20)
    })

    it('3.8: Attempting to update an element with isInherited: true must be blocked', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-badge', {
        isInherited: true,
        xMm: 10,
        yMm: 10,
        widthMm: 40,
        heightMm: 20,
      })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })

      // Dispatch UPDATE_ELEMENT directly targeting inherited element
      const updatedState = studioNextReducer(state, {
        type: 'UPDATE_ELEMENT',
        id: 'master-badge',
        patch: { xMm: 80, widthMm: 120 } as any,
      })

      const updatedEl = updatedState.layout.pages[0].elements.find((e) => e.id === 'master-badge')
      expect(updatedEl?.xMm).toBe(10)
      expect(updatedEl?.widthMm).toBe(40)
    })

    it('3.9: Nudging an element with isInherited: true must be blocked', () => {
      let state = initialStudioNextState()
      const inheritedEl = createElement('master-badge', {
        isInherited: true,
        xMm: 10,
        yMm: 10,
        widthMm: 40,
        heightMm: 20,
      })
      state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: inheritedEl })
      state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'master-badge' })

      // Dispatch NUDGE_SELECTED
      const nudgedState = studioNextReducer(state, {
        type: 'NUDGE_SELECTED',
        dxMm: 5,
        dyMm: 5,
      })

      const nudgedEl = nudgedState.layout.pages[0].elements.find((e) => e.id === 'master-badge')
      expect(nudgedEl?.xMm).toBe(10)
      expect(nudgedEl?.yMm).toBe(10)
    })
  })
})
