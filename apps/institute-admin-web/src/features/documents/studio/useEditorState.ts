import { PAGE_SIZES_MM, type CanvasElement, type LayoutV2, type LayoutWatermark, type LayoutZones } from '../engine/types'
import { makeElementId } from './elementDefaults'

export interface EditorState {
  layout: LayoutV2
  activePage: number
  selectedId: string | null
  sampleMode: boolean
  zoom: number
  history: string[]
  historyIndex: number
  dirty: boolean
}

export const initialEditorState: EditorState = {
  layout: { version: 2, page: { sizeId: 'A4P', marginMm: 10, background: '#FFFFFF' }, zones: { headerMm: 0, footerMm: 0, repeatHeader: false, repeatFooter: false, hideHeaderOnFirstPage: false }, watermark: { enabled: false, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.07 }, pages: [{ elements: [] }] },
  activePage: 0,
  selectedId: null,
  sampleMode: true,
  zoom: 1,
  history: [],
  historyIndex: -1,
  dirty: false,
}

export type EditorAction =
  | { type: 'load'; layout: LayoutV2 }
  | { type: 'select'; id: string | null }
  | { type: 'setActivePage'; page: number }
  | { type: 'addElement'; element: CanvasElement }
  | { type: 'updateElement'; id: string; patch: Partial<CanvasElement> }
  | { type: 'moveElement'; id: string; x: number; y: number }
  | { type: 'resizeElement'; id: string; w: number; h: number }
  | { type: 'commit' }
  | { type: 'deleteElement'; id: string }
  | { type: 'duplicateElement'; id: string }
  | { type: 'setPage'; patch: Partial<LayoutV2['page']> }
  | { type: 'setZones'; patch: Partial<LayoutZones> }
  | { type: 'setWatermark'; patch: Partial<LayoutWatermark> }
  | { type: 'undo' } | { type: 'redo' }
  | { type: 'setZoom'; zoom: number }
  | { type: 'setSampleMode'; on: boolean }
  | { type: 'markSaved' }

const MIN_W = 4
const MIN_H = 1
const HISTORY_LIMIT = 100

function clampElement<T extends CanvasElement>(element: T, layout: LayoutV2): T {
  const { w: pageW, h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  const w = Math.min(Math.max(element.w, MIN_W), pageW)
  const h = Math.min(Math.max(element.h, MIN_H), pageH)
  return {
    ...element, w, h,
    x: Math.min(Math.max(element.x, 0), pageW - w),
    y: Math.min(Math.max(element.y, 0), pageH - h),
  }
}

function mapElements(layout: LayoutV2, page: number, fn: (elements: CanvasElement[]) => CanvasElement[]): LayoutV2 {
  return {
    ...layout,
    pages: layout.pages.map((entry, index) => (index === page ? { elements: fn(entry.elements) } : entry)),
  }
}

function pushHistory(state: EditorState, layout: LayoutV2): EditorState {
  const snapshot = JSON.stringify(layout)
  const history = [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-HISTORY_LIMIT)
  return { ...state, layout, history, historyIndex: history.length - 1, dirty: true }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load': {
      const snapshot = JSON.stringify(action.layout)
      return { ...initialEditorState, layout: action.layout, history: [snapshot], historyIndex: 0, sampleMode: state.sampleMode, zoom: state.zoom }
    }
    case 'select': return { ...state, selectedId: action.id }
    case 'setActivePage': return { ...state, activePage: action.page, selectedId: null }
    case 'addElement': {
      if (action.element.type === 'table'
        && state.layout.pages.some((page) => page.elements.some((element) => element.type === 'table'))) {
        return state
      }
      const element = clampElement(action.element, state.layout)
      const layout = mapElements(state.layout, state.activePage, (elements) => [...elements, element])
      return { ...pushHistory(state, layout), selectedId: element.id }
    }
    case 'updateElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.map((element) => (element.id === action.id
          ? clampElement({ ...element, ...action.patch, id: element.id, type: element.type } as CanvasElement, state.layout)
          : element)))
      return pushHistory(state, layout)
    }
    case 'moveElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.map((element) => (element.id === action.id
          ? clampElement({ ...element, x: action.x, y: action.y }, state.layout)
          : element)))
      return { ...state, layout, dirty: true }
    }
    case 'resizeElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.map((element) => (element.id === action.id
          ? clampElement({ ...element, w: action.w, h: action.h }, state.layout)
          : element)))
      return { ...state, layout, dirty: true }
    }
    case 'commit': return pushHistory(state, state.layout)
    case 'deleteElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.filter((element) => element.id !== action.id))
      return { ...pushHistory(state, layout), selectedId: state.selectedId === action.id ? null : state.selectedId }
    }
    case 'duplicateElement': {
      const source = state.layout.pages[state.activePage].elements.find((element) => element.id === action.id)
      if (!source || source.type === 'table') return state
      const copy = clampElement({ ...JSON.parse(JSON.stringify(source)), id: makeElementId(), x: source.x + 4, y: source.y + 4 }, state.layout)
      const layout = mapElements(state.layout, state.activePage, (elements) => [...elements, copy])
      return { ...pushHistory(state, layout), selectedId: copy.id }
    }
    case 'setPage': return pushHistory(state, { ...state.layout, page: { ...state.layout.page, ...action.patch } })
    case 'setZones': return pushHistory(state, { ...state.layout, zones: { ...state.layout.zones, ...action.patch } })
    case 'setWatermark': return pushHistory(state, { ...state.layout, watermark: { ...state.layout.watermark, ...action.patch } })
    case 'undo': {
      if (state.historyIndex <= 0) return state
      const index = state.historyIndex - 1
      const layout = JSON.parse(state.history[index]) as LayoutV2
      const activePage = Math.min(Math.max(state.activePage, 0), layout.pages.length - 1)
      return { ...state, layout, activePage, historyIndex: index, selectedId: null, dirty: true }
    }
    case 'redo': {
      if (state.historyIndex >= state.history.length - 1) return state
      const index = state.historyIndex + 1
      const layout = JSON.parse(state.history[index]) as LayoutV2
      const activePage = Math.min(Math.max(state.activePage, 0), layout.pages.length - 1)
      return { ...state, layout, activePage, historyIndex: index, selectedId: null, dirty: true }
    }
    case 'setZoom': return { ...state, zoom: Math.min(Math.max(action.zoom, 0.4), 2) }
    case 'setSampleMode': return { ...state, sampleMode: action.on }
    case 'markSaved': return { ...state, dirty: false }
  }
}
