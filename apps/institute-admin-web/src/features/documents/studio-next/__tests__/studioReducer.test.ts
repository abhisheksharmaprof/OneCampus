import { describe, expect, it } from 'vitest'
import { initialStudioNextState, studioNextReducer } from '../state/studioNextReducer'
import type { ElementV3 } from '@campusone/document-engine'

describe('Studio Next Reducer & History Architecture', () => {
  const dummyElement: ElementV3 = {
    id: 'el-1',
    type: 'text',
    zone: 'body',
    xMm: 20,
    yMm: 30,
    widthMm: 60,
    heightMm: 15,
  }

  it('initializes with a single history snapshot and dirty = false', () => {
    const state = initialStudioNextState()
    expect(state.history.length).toBe(1)
    expect(state.historyIndex).toBe(0)
    expect(state.dirty).toBe(false)
  })

  it('adding an element commits to history, advances index, and sets dirty = true', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement })

    expect(state.layout.pages[0].elements.length).toBe(1)
    expect(state.history.length).toBe(2)
    expect(state.historyIndex).toBe(1)
    expect(state.dirty).toBe(true)
    expect(state.selectedElementIds).toEqual(['el-1'])
  })

  it('coalesces transient moves into a single history snapshot only on commit', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement })
    expect(state.history.length).toBe(2)

    // Simulate rapid 60fps drag moves
    for (let i = 1; i <= 10; i++) {
      state = studioNextReducer(state, {
        type: 'MOVE_ELEMENT_TRANSIENT',
        id: 'el-1',
        xMm: 20 + i,
        yMm: 30 + i,
      })
      // During active drag, history count MUST NOT increment
      expect(state.history.length).toBe(2)
      expect(state.historyIndex).toBe(1)
    }

    expect(state.layout.pages[0].elements[0].xMm).toBe(30)
    expect(state.layout.pages[0].elements[0].yMm).toBe(40)

    // On drag release, COMMIT_HISTORY is dispatched
    state = studioNextReducer(state, { type: 'COMMIT_HISTORY' })
    expect(state.history.length).toBe(3)
    expect(state.historyIndex).toBe(2)

    // A redundant commit with no layout change is a strict no-op
    const noopState = studioNextReducer(state, { type: 'COMMIT_HISTORY' })
    expect(noopState.history.length).toBe(3)
    expect(noopState.historyIndex).toBe(2)
  })

  it('undo restores previous state, and redo recovers undone state', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement })
    expect(state.layout.pages[0].elements.length).toBe(1)

    // Undo -> empty elements
    state = studioNextReducer(state, { type: 'UNDO' })
    expect(state.historyIndex).toBe(0)
    expect(state.layout.pages[0].elements.length).toBe(0)

    // Redo -> restored element
    state = studioNextReducer(state, { type: 'REDO' })
    expect(state.historyIndex).toBe(1)
    expect(state.layout.pages[0].elements.length).toBe(1)
    expect(state.layout.pages[0].elements[0].id).toBe('el-1')
  })

  it('invalidates future redo branch when a new mutating action occurs after undo', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement }) // history len = 2
    state = studioNextReducer(state, {
      type: 'ADD_ELEMENT',
      element: { ...dummyElement, id: 'el-2' },
    }) // history len = 3, index = 2

    // Undo back to step 1 (el-1 only)
    state = studioNextReducer(state, { type: 'UNDO' })
    expect(state.historyIndex).toBe(1)

    // Branch off by adding el-3 instead of redoing el-2
    state = studioNextReducer(state, {
      type: 'ADD_ELEMENT',
      element: { ...dummyElement, id: 'el-3' },
    })

    // Redo branch must be permanently truncated: history len = 3, index = 2
    expect(state.history.length).toBe(3)
    expect(state.historyIndex).toBe(2)

    // Redo is now impossible (already at tip)
    const afterRedo = studioNextReducer(state, { type: 'REDO' })
    expect(afterRedo.historyIndex).toBe(2)
  })

  it('reorders elements in z-order correctly', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: { ...dummyElement, id: 'a' } })
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: { ...dummyElement, id: 'b' } })
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: { ...dummyElement, id: 'c' } })

    const ids = () => state.layout.pages[0].elements.map((e) => e.id)
    expect(ids()).toEqual(['a', 'b', 'c'])

    // Send 'c' to back
    state = studioNextReducer(state, { type: 'SEND_TO_BACK', id: 'c' })
    expect(ids()).toEqual(['c', 'a', 'b'])

    // Bring 'c' to front
    state = studioNextReducer(state, { type: 'BRING_TO_FRONT', id: 'c' })
    expect(ids()).toEqual(['a', 'b', 'c'])

    // Step down 'c'
    state = studioNextReducer(state, { type: 'STEP_DOWN', id: 'c' })
    expect(ids()).toEqual(['a', 'c', 'b'])

    // Step up 'a'
    state = studioNextReducer(state, { type: 'STEP_UP', id: 'a' })
    expect(ids()).toEqual(['c', 'a', 'b'])
  })

  it('duplicates selected elements with offset and fresh UUIDs', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, { type: 'ADD_ELEMENT', element: dummyElement })
    state = studioNextReducer(state, { type: 'SELECT_ELEMENT', id: 'el-1' })

    state = studioNextReducer(state, { type: 'DUPLICATE_SELECTED', offsetMm: 6 })
    expect(state.layout.pages[0].elements.length).toBe(2)
    const duplicate = state.layout.pages[0].elements[1]
    expect(duplicate.id).not.toBe('el-1')
    expect(duplicate.xMm).toBe(26)
    expect(duplicate.yMm).toBe(36)
    expect(state.selectedElementIds).toEqual([duplicate.id])
  })

  it('handles concurrency conflict and reload resolution', () => {
    let state = initialStudioNextState()
    state = studioNextReducer(state, {
      type: 'SAVE_CONFLICT',
      serverRevision: 5,
      message: 'Template modified on another workstation',
    })

    expect(state.saveConflict).toEqual({
      serverRevision: 5,
      message: 'Template modified on another workstation',
    })

    // Resolve by reloading server layout
    const serverLayout = { ...state.layout, zones: { headerMm: 50, footerMm: 25 } }
    state = studioNextReducer(state, {
      type: 'RESOLVE_CONFLICT_RELOAD',
      layout: serverLayout,
      revision: 5,
    })

    expect(state.saveConflict).toBeNull()
    expect(state.revision).toBe(5)
    expect(state.layout.zones.headerMm).toBe(50)
    expect(state.dirty).toBe(false)
  })
})
