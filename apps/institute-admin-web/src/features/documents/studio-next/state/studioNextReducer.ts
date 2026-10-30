import type { ElementV3, LayoutV3, ZoneV3, TableElementV3, StaticTableElementV3 } from '@campusone/document-engine'
import {
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  mergeCells,
  splitCell,
  updateCell,
  updateTableStyle,
  resizeColumnDivider,
} from '@campusone/document-engine'
import type { DocumentTemplateRecord } from '../../documents.api'
import { PAGE_SIZES_MM } from '../../engine/types'
import { createDefaultLayoutV3 } from '../constants'
import { pageToZoneY, zoneToPageY } from '../math/coordinates'
import type { StudioNextAction, StudioNextState } from '../types'

export function initialStudioNextState(
  template?: DocumentTemplateRecord,
  layoutV3?: LayoutV3,
): StudioNextState {
  const initialLayout = layoutV3 ?? (template?.layout?.version === 3 ? (template.layout as LayoutV3) : createDefaultLayoutV3())
  const layoutJson = JSON.stringify(initialLayout)

  return {
    templateId: template?.id ?? 'draft',
    templateName: template?.name ?? 'Untitled Template',
    category: template?.category ?? 'FEE_INVOICE',
    revision: template?.revision ?? 1,

    layout: initialLayout,
    activePageIndex: 0,

    selectedElementIds: [],
    hoveredElementId: null,
    activeResizeHandle: null,

    zoom: 1.0,
    panOffset: { x: 0, y: 0 },

    activeLeftTab: 'elements',
    activeInspectorTab: 'element',
    mobileOpenPanel: null,

    sampleMode: true,
    snapToGuides: true,
    snapToGrid: false,
    showGrid: false,
    cursorMm: null,
    smartGuides: [],

    clipboard: null,

    history: [layoutJson],
    historyIndex: 0,
    dirty: false,
    saving: false,
    saveConflict: null,
    lastSavedAt: null,
  }
}

/** Helper: commits the current layout to history, truncating any future redo branch */
function pushHistorySnapshot(state: StudioNextState, newLayout: LayoutV3): StudioNextState {
  const currentSnapshot = JSON.stringify(newLayout)
  const lastSnapshot = state.history[state.historyIndex]

  if (currentSnapshot === lastSnapshot) {
    return { ...state, layout: newLayout }
  }

  const truncated = state.history.slice(0, state.historyIndex + 1)
  const newHistory = [...truncated, currentSnapshot].slice(-100)

  return {
    ...state,
    layout: newLayout,
    history: newHistory,
    historyIndex: newHistory.length - 1,
    dirty: true,
  }
}

function updateTableInLayout(
  layout: LayoutV3,
  pageIndex: number,
  elementId: string,
  updater: (table: TableElementV3) => TableElementV3,
): LayoutV3 {
  const pages = layout.pages.map((p, idx) => {
    if (idx !== pageIndex) return p
    const elements = p.elements.map((el) => {
      if (el.id !== elementId || el.type !== 'table') return el
      return updater(el as TableElementV3)
    })
    return { ...p, elements }
  })
  return { ...layout, pages }
}

export function studioNextReducer(
  state: StudioNextState,
  action: StudioNextAction,
): StudioNextState {
  switch (action.type) {
    case 'LOAD_TEMPLATE': {
      const layoutJson = JSON.stringify(action.layoutV3)
      return {
        ...state,
        templateId: action.template.id,
        templateName: action.template.name,
        category: action.template.category,
        revision: action.template.revision ?? 1,
        layout: action.layoutV3,
        activePageIndex: 0,
        selectedElementIds: [],
        history: [layoutJson],
        historyIndex: 0,
        dirty: false,
        saveConflict: null,
      }
    }

    case 'SET_TEMPLATE_NAME': {
      return { ...state, templateName: action.name, dirty: true }
    }

    case 'SELECT_ELEMENT': {
      if (action.id === null) {
        return { ...state, selectedElementIds: [] }
      }
      if (action.multi) {
        const exists = state.selectedElementIds.includes(action.id)
        const updated = exists
          ? state.selectedElementIds.filter((id) => id !== action.id)
          : [...state.selectedElementIds, action.id]
        return { ...state, selectedElementIds: updated }
      }
      return { ...state, selectedElementIds: [action.id] }
    }

    case 'SELECT_ALL': {
      const currentPage = state.layout.pages[state.activePageIndex]
      if (!currentPage) return state
      const allIds = currentPage.elements.filter((el) => !el.isInherited).map((el) => el.id)
      return { ...state, selectedElementIds: allIds }
    }

    case 'CLEAR_SELECTION': {
      return { ...state, selectedElementIds: [], smartGuides: [] }
    }

    case 'SET_HOVERED_ELEMENT': {
      return { ...state, hoveredElementId: action.id }
    }

    case 'SET_ACTIVE_PAGE': {
      const pageIndex = Math.max(0, Math.min(action.pageIndex, state.layout.pages.length - 1))
      return { ...state, activePageIndex: pageIndex, selectedElementIds: [] }
    }

    case 'ADD_PAGE': {
      const newPage = { id: crypto.randomUUID(), elements: [] }
      const newPages = [...state.layout.pages, newPage]
      const newLayout = { ...state.layout, pages: newPages }
      const nextState = pushHistorySnapshot(state, newLayout)
      return { ...nextState, activePageIndex: newPages.length - 1, selectedElementIds: [] }
    }

    case 'DELETE_PAGE': {
      if (state.layout.pages.length <= 1) return state
      const newPages = state.layout.pages.filter((_, idx) => idx !== action.pageIndex)
      const newLayout = { ...state.layout, pages: newPages }
      const nextState = pushHistorySnapshot(state, newLayout)
      const newActive = Math.min(state.activePageIndex, newPages.length - 1)
      return { ...nextState, activePageIndex: newActive, selectedElementIds: [] }
    }

    case 'ADD_ELEMENT': {
      const pageIndex = action.pageIndex ?? state.activePageIndex
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== pageIndex) return p
        return { ...p, elements: [...p.elements, action.element] }
      })
      const newLayout = { ...state.layout, pages }
      const nextState = pushHistorySnapshot(state, newLayout)
      return { ...nextState, selectedElementIds: [action.element.id] }
    }

    case 'UPDATE_ELEMENT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id || el.isInherited) return el
          return { ...el, ...action.patch } as ElementV3
        })
        return { ...p, elements }
      })
      const newLayout = { ...state.layout, pages }
      return pushHistorySnapshot(state, newLayout)
    }

    case 'UPDATE_ELEMENT_TRANSIENT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id || el.isInherited) return el
          return { ...el, ...action.patch } as ElementV3
        })
        return { ...p, elements }
      })
      return { ...state, layout: { ...state.layout, pages }, dirty: true }
    }

    case 'MOVE_ELEMENT_TRANSIENT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id || el.isInherited) return el
          return { ...el, xMm: action.xMm, yMm: action.yMm }
        })
        return { ...p, elements }
      })
      return { ...state, layout: { ...state.layout, pages }, dirty: true }
    }

    case 'RESIZE_ELEMENT_TRANSIENT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id || el.isInherited) return el
          return {
            ...el,
            xMm: action.xMm,
            yMm: action.yMm,
            widthMm: action.widthMm,
            heightMm: action.heightMm,
          }
        })
        return { ...p, elements }
      })
      return { ...state, layout: { ...state.layout, pages }, dirty: true }
    }

    case 'ROTATE_ELEMENT_TRANSIENT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id || el.isInherited) return el
          return { ...el, rotationDeg: action.rotationDeg }
        })
        return { ...p, elements }
      })
      return { ...state, layout: { ...state.layout, pages }, dirty: true }
    }

    case 'NUDGE_SELECTED': {
      const selectedSet = new Set(state.selectedElementIds)
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (!selectedSet.has(el.id) || el.locked || el.isInherited) return el
          return {
            ...el,
            xMm: Math.round((el.xMm + action.dxMm) * 100) / 100,
            yMm: Math.round((el.yMm + action.dyMm) * 100) / 100,
          }
        })
        return { ...p, elements }
      })
      return { ...state, layout: { ...state.layout, pages }, dirty: true }
    }

    case 'COMMIT_HISTORY': {
      return pushHistorySnapshot(state, state.layout)
    }

    case 'DELETE_SELECTED': {
      if (state.selectedElementIds.length === 0) return state
      const toDelete = new Set(state.selectedElementIds)
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        return {
          ...p,
          elements: p.elements.filter((el) => !toDelete.has(el.id) || el.isInherited || el.locked),
        }
      })
      const newLayout = { ...state.layout, pages }
      const nextState = pushHistorySnapshot(state, newLayout)
      return { ...nextState, selectedElementIds: [] }
    }

    case 'DUPLICATE_SELECTED': {
      if (state.selectedElementIds.length === 0) return state
      const offset = action.offsetMm ?? 5
      const toDuplicate = new Set(state.selectedElementIds)
      const currentPage = state.layout.pages[state.activePageIndex]
      if (!currentPage) return state

      const duplicatedElements: ElementV3[] = []
      currentPage.elements.forEach((el) => {
        if (toDuplicate.has(el.id) && !el.isInherited) {
          const clone: ElementV3 = {
            ...JSON.parse(JSON.stringify(el)),
            id: crypto.randomUUID(),
            xMm: el.xMm + offset,
            yMm: el.yMm + offset,
          }
          duplicatedElements.push(clone)
        }
      })

      if (duplicatedElements.length === 0) return state

      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        return { ...p, elements: [...p.elements, ...duplicatedElements] }
      })
      const newLayout = { ...state.layout, pages }
      const nextState = pushHistorySnapshot(state, newLayout)
      return {
        ...nextState,
        selectedElementIds: duplicatedElements.map((el) => el.id),
      }
    }

    case 'BRING_TO_FRONT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const index = p.elements.findIndex((el) => el.id === action.id)
        if (index === -1 || index === p.elements.length - 1) return p
        const copy = [...p.elements]
        const [item] = copy.splice(index, 1)
        copy.push(item)
        return { ...p, elements: copy }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'SEND_TO_BACK': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const index = p.elements.findIndex((el) => el.id === action.id)
        if (index === -1 || index === 0) return p
        const copy = [...p.elements]
        const [item] = copy.splice(index, 1)
        copy.unshift(item)
        return { ...p, elements: copy }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'STEP_UP': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const index = p.elements.findIndex((el) => el.id === action.id)
        if (index === -1 || index >= p.elements.length - 1) return p
        const copy = [...p.elements]
        const [item] = copy.splice(index, 1)
        copy.splice(index + 1, 0, item)
        return { ...p, elements: copy }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'STEP_DOWN': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const index = p.elements.findIndex((el) => el.id === action.id)
        if (index <= 0) return p
        const copy = [...p.elements]
        const [item] = copy.splice(index, 1)
        copy.splice(index - 1, 0, item)
        return { ...p, elements: copy }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'TOGGLE_LOCK': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id) return el
          return { ...el, locked: !el.locked }
        })
        return { ...p, elements }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'TOGGLE_VISIBILITY': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id) return el
          return { ...el, visible: el.visible === false ? true : false }
        })
        return { ...p, elements }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'REASSIGN_ZONE': {
      const size = PAGE_SIZES_MM[state.layout.page.sizeId]
      const pageHeight = state.layout.page.orientation === 'LANDSCAPE' ? size.w : size.h
      const { headerMm, footerMm } = state.layout.zones

      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id || el.isInherited) return el
          const currentAbsY = zoneToPageY(el.zone, el.yMm, headerMm, footerMm, pageHeight)
          const newRelY = pageToZoneY(action.zone, currentAbsY, headerMm, footerMm, pageHeight)
          return {
            ...el,
            zone: action.zone,
            yMm: Math.round(newRelY * 100) / 100,
          }
        })
        return { ...p, elements }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'DETACH_MASTER_ELEMENT': {
      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        const elements = p.elements.map((el) => {
          if (el.id !== action.id) return el
          const detached = { ...el }
          delete detached.isInherited
          return detached as ElementV3
        })
        return { ...p, elements }
      })
      return pushHistorySnapshot(state, { ...state.layout, pages })
    }

    case 'UPDATE_PAGE_SETUP': {
      const newPage = { ...state.layout.page, ...action.patch }
      return pushHistorySnapshot(state, { ...state.layout, page: newPage })
    }

    case 'UPDATE_ZONES': {
      const newZones = { ...state.layout.zones, ...action.patch }
      return pushHistorySnapshot(state, { ...state.layout, zones: newZones })
    }

    case 'UPDATE_WATERMARK': {
      const newWatermark = { ...state.layout.watermark, ...action.patch }
      return pushHistorySnapshot(state, { ...state.layout, watermark: newWatermark })
    }

    case 'SET_MASTER_LETTERHEAD': {
      const newLayout: LayoutV3 = {
        ...state.layout,
        masterLetterhead: action.binding ?? undefined,
      }
      return pushHistorySnapshot(state, newLayout)
    }

    case 'SET_ZOOM': {
      const zoom = Math.max(0.25, Math.min(4.0, action.zoom))
      return { ...state, zoom }
    }

    case 'SET_PAN': {
      return { ...state, panOffset: action.offset }
    }

    case 'SET_ACTIVE_LEFT_TAB': {
      return { ...state, activeLeftTab: action.tab }
    }

    case 'SET_ACTIVE_INSPECTOR_TAB': {
      return { ...state, activeInspectorTab: action.tab }
    }

    case 'SET_MOBILE_PANEL': {
      return { ...state, mobileOpenPanel: action.panel }
    }

    case 'SET_SAMPLE_MODE': {
      return { ...state, sampleMode: action.enabled }
    }

    case 'SET_CURSOR_MM': {
      return { ...state, cursorMm: action.coords }
    }

    case 'SET_SMART_GUIDES': {
      return { ...state, smartGuides: action.guides }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const targetIndex = state.historyIndex - 1
      const restoredLayout = JSON.parse(state.history[targetIndex]) as LayoutV3
      const validPageIndex = Math.min(state.activePageIndex, restoredLayout.pages.length - 1)
      const validSelectedIds = state.selectedElementIds.filter((id) =>
        restoredLayout.pages[validPageIndex]?.elements.some((el) => el.id === id),
      )
      return {
        ...state,
        layout: restoredLayout,
        historyIndex: targetIndex,
        activePageIndex: validPageIndex,
        selectedElementIds: validSelectedIds,
        dirty: true,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const targetIndex = state.historyIndex + 1
      const restoredLayout = JSON.parse(state.history[targetIndex]) as LayoutV3
      const validPageIndex = Math.min(state.activePageIndex, restoredLayout.pages.length - 1)
      const validSelectedIds = state.selectedElementIds.filter((id) =>
        restoredLayout.pages[validPageIndex]?.elements.some((el) => el.id === id),
      )
      return {
        ...state,
        layout: restoredLayout,
        historyIndex: targetIndex,
        activePageIndex: validPageIndex,
        selectedElementIds: validSelectedIds,
        dirty: true,
      }
    }

    case 'COPY_SELECTED': {
      const currentPage = state.layout.pages[state.activePageIndex]
      if (!currentPage || state.selectedElementIds.length === 0) return state
      const selectedSet = new Set(state.selectedElementIds)
      const elementsToCopy = currentPage.elements.filter(
        (el) => selectedSet.has(el.id) && !el.isInherited,
      )
      return { ...state, clipboard: JSON.parse(JSON.stringify(elementsToCopy)) }
    }

    case 'PASTE': {
      if (!state.clipboard || state.clipboard.length === 0) return state
      const pastedElements: ElementV3[] = state.clipboard.map((el) => ({
        ...JSON.parse(JSON.stringify(el)),
        id: crypto.randomUUID(),
        xMm: el.xMm + 5,
        yMm: el.yMm + 5,
      }))

      const pages = state.layout.pages.map((p, idx) => {
        if (idx !== state.activePageIndex) return p
        return { ...p, elements: [...p.elements, ...pastedElements] }
      })
      const newLayout = { ...state.layout, pages }
      const nextState = pushHistorySnapshot(state, newLayout)
      return {
        ...nextState,
        selectedElementIds: pastedElements.map((el) => el.id),
      }
    }

    case 'SAVE_START': {
      return { ...state, saving: true }
    }

    case 'SAVE_SUCCESS': {
      return {
        ...state,
        saving: false,
        dirty: false,
        revision: action.newRevision,
        saveConflict: null,
        lastSavedAt: new Date().toISOString(),
      }
    }

    case 'SAVE_CONFLICT': {
      return {
        ...state,
        saving: false,
        saveConflict: {
          serverRevision: action.serverRevision,
          message: action.message,
        },
      }
    }

    case 'SAVE_ERROR': {
      return { ...state, saving: false }
    }

    case 'RESOLVE_CONFLICT_RELOAD': {
      const layoutJson = JSON.stringify(action.layout)
      return {
        ...state,
        layout: action.layout,
        revision: action.revision,
        saveConflict: null,
        dirty: false,
        history: [layoutJson],
        historyIndex: 0,
      }
    }

    case 'TABLE_INSERT_ROW': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? insertRow(t as StaticTableElementV3, action.atIndex, action.position) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_DELETE_ROW': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? deleteRow(t as StaticTableElementV3, action.rowIndex) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_INSERT_COLUMN': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? insertColumn(t as StaticTableElementV3, action.atIndex, action.position) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_DELETE_COLUMN': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? deleteColumn(t as StaticTableElementV3, action.colIndex) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_MERGE_CELLS': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? mergeCells(t as StaticTableElementV3, action.selectedCells) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_SPLIT_CELL': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? splitCell(t as StaticTableElementV3, action.row, action.column) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_UPDATE_CELL': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        t.mode === 'static' ? updateCell(t as StaticTableElementV3, action.row, action.column, action.patch) : t,
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_UPDATE_STYLE': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) =>
        updateTableStyle(t, action.patch),
      )
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_SET_BINDING': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) => ({
        ...t,
        mode: 'dynamic',
        datasetId: action.binding.datasetName,
        datasetBinding: action.binding,
      }))
      return pushHistorySnapshot(state, newLayout)
    }

    case 'TABLE_RESIZE_COLUMN_TRANSIENT': {
      const newLayout = updateTableInLayout(state.layout, state.activePageIndex, action.elementId, (t) => ({
        ...t,
        columns: resizeColumnDivider(t.columns, action.colIndex, action.deltaMm, t.widthMm),
      }))
      return { ...state, layout: newLayout, dirty: true }
    }

    default:
      return state
  }
}
