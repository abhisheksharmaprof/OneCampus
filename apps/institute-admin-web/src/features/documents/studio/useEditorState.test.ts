import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from './useEditorState'
import { defaultElement } from './elementDefaults'
import { defaultLayout } from '../engine/types'

function loaded() {
  return editorReducer(initialEditorState, { type: 'load', layout: defaultLayout('A4P') })
}

describe('editorReducer', () => {
  it('adds, selects and clamps elements to the page', () => {
    let state = loaded()
    const el = defaultElement('text', 'FEE_INVOICE')
    state = editorReducer(state, { type: 'addElement', element: { ...el, x: 500, y: -20 } })
    const added = state.layout.pages[0].elements[0]
    expect(state.selectedId).toBe(added.id)
    expect(added.x).toBeLessThanOrEqual(210 - added.w)
    expect(added.y).toBeGreaterThanOrEqual(0)
  })

  it('transient moves do not enter history until commit', () => {
    let state = loaded()
    state = editorReducer(state, { type: 'addElement', element: defaultElement('text', 'FEE_INVOICE') })
    const id = state.selectedId!
    const depth = state.history.length
    state = editorReducer(state, { type: 'moveElement', id, x: 50, y: 60 })
    expect(state.history.length).toBe(depth)
    state = editorReducer(state, { type: 'commit' })
    expect(state.history.length).toBe(depth + 1)
  })

  it('undo/redo restores layout snapshots and clears dangling selection', () => {
    let state = loaded()
    state = editorReducer(state, { type: 'addElement', element: defaultElement('shape', 'FEE_INVOICE') })
    const id = state.selectedId!
    state = editorReducer(state, { type: 'deleteElement', id })
    expect(state.layout.pages[0].elements).toHaveLength(0)
    state = editorReducer(state, { type: 'undo' })
    expect(state.layout.pages[0].elements).toHaveLength(1)
    state = editorReducer(state, { type: 'redo' })
    expect(state.layout.pages[0].elements).toHaveLength(0)
    expect(state.selectedId).toBeNull()
  })

  it('duplicate offsets the copy and enforces the single-table rule', () => {
    let state = loaded()
    state = editorReducer(state, { type: 'addElement', element: defaultElement('table', 'FEE_INVOICE') })
    const tableId = state.selectedId!
    state = editorReducer(state, { type: 'duplicateElement', id: tableId })
    expect(state.layout.pages[0].elements.filter((element) => element.type === 'table')).toHaveLength(1)
    state = editorReducer(state, { type: 'addElement', element: defaultElement('text', 'FEE_INVOICE') })
    const textId = state.selectedId!
    state = editorReducer(state, { type: 'duplicateElement', id: textId })
    const texts = state.layout.pages[0].elements.filter((element) => element.type === 'text')
    expect(texts).toHaveLength(2)
    expect(texts[1].x).toBeCloseTo(texts[0].x + 4)
  })

  it('page/zone/watermark edits commit; zoom and sampleMode do not', () => {
    let state = loaded()
    const depth = state.history.length
    state = editorReducer(state, { type: 'setZones', patch: { headerMm: 30 } })
    expect(state.layout.zones.headerMm).toBe(30)
    expect(state.history.length).toBe(depth + 1)
    state = editorReducer(state, { type: 'setZoom', zoom: 1.2 })
    state = editorReducer(state, { type: 'setSampleMode', on: false })
    expect(state.history.length).toBe(depth + 1)
  })
})
