import type {
  LayoutV3,
  ElementV3,
  ZoneV3,
  PageSizeId,
  Orientation,
  MasterLetterheadBindingV3,
  WatermarkV3,
  TableCellV3,
  TableStyleV3,
  TableDatasetBindingV3,
} from '@campusone/document-engine'
import type { DocumentCategory } from '../engine/types'
import type { DocumentTemplateRecord } from '../documents.api'

export type {
  DocumentCategory,
  LayoutV3,
  ElementV3,
  ZoneV3,
  PageSizeId,
  Orientation,
  MasterLetterheadBindingV3,
  WatermarkV3,
  TableCellV3,
  TableStyleV3,
  TableDatasetBindingV3,
}

export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface SnapTarget {
  axis: 'x' | 'y'
  positionMm: number
  kind: 'margin' | 'center' | 'zone' | 'sibling-edge' | 'sibling-center'
  label?: string
}

export interface SnapGuideLine {
  axis: 'x' | 'y'
  positionMm: number
  kind: SnapTarget['kind']
}

export interface SnapEngineResult {
  xMm: number
  yMm: number
  guides: SnapGuideLine[]
}

export type LeftRailTabId = 'elements' | 'fields' | 'blocks' | 'layers'
export type InspectorTabId = 'element' | 'page' | 'watermark'

export interface StudioNextState {
  templateId: string
  templateName: string
  category: DocumentCategory
  revision: number

  layout: LayoutV3
  activePageIndex: number

  selectedElementIds: string[]
  hoveredElementId: string | null
  activeResizeHandle: ResizeHandleId | null

  zoom: number // 0.25 to 4.0
  panOffset: { x: number; y: number }

  activeLeftTab: LeftRailTabId
  activeInspectorTab: InspectorTabId
  mobileOpenPanel: 'left' | 'right' | null

  sampleMode: boolean
  snapToGuides: boolean
  snapToGrid: boolean
  showGrid: boolean
  cursorMm: { xMm: number; yMm: number } | null
  smartGuides: SnapGuideLine[]

  clipboard: ElementV3[] | null

  history: string[] // JSON serialized LayoutV3 snapshots
  historyIndex: number
  dirty: boolean
  saving: boolean
  saveConflict: { serverRevision: number; message: string } | null
  lastSavedAt: string | null
}

export type StudioNextAction =
  | { type: 'LOAD_TEMPLATE'; template: DocumentTemplateRecord; layoutV3: LayoutV3 }
  | { type: 'SET_TEMPLATE_NAME'; name: string }
  | { type: 'SELECT_ELEMENT'; id: string | null; multi?: boolean }
  | { type: 'SELECT_ALL' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_HOVERED_ELEMENT'; id: string | null }
  | { type: 'SET_ACTIVE_PAGE'; pageIndex: number }
  | { type: 'ADD_PAGE' }
  | { type: 'DELETE_PAGE'; pageIndex: number }
  | { type: 'ADD_ELEMENT'; element: ElementV3; pageIndex?: number }
  | { type: 'UPDATE_ELEMENT'; id: string; patch: Partial<ElementV3> }
  | { type: 'UPDATE_ELEMENT_TRANSIENT'; id: string; patch: Partial<ElementV3> }
  | { type: 'MOVE_ELEMENT_TRANSIENT'; id: string; xMm: number; yMm: number }
  | { type: 'RESIZE_ELEMENT_TRANSIENT'; id: string; xMm: number; yMm: number; widthMm: number; heightMm: number }
  | { type: 'ROTATE_ELEMENT_TRANSIENT'; id: string; rotationDeg: number }
  | { type: 'NUDGE_SELECTED'; dxMm: number; dyMm: number }
  | { type: 'COMMIT_HISTORY' }
  | { type: 'DELETE_SELECTED' }
  | { type: 'DUPLICATE_SELECTED'; offsetMm?: number }
  | { type: 'BRING_TO_FRONT'; id: string }
  | { type: 'SEND_TO_BACK'; id: string }
  | { type: 'STEP_UP'; id: string }
  | { type: 'STEP_DOWN'; id: string }
  | { type: 'TOGGLE_LOCK'; id: string }
  | { type: 'TOGGLE_VISIBILITY'; id: string }
  | { type: 'REASSIGN_ZONE'; id: string; zone: ZoneV3 }
  | { type: 'DETACH_MASTER_ELEMENT'; id: string }
  | { type: 'UPDATE_PAGE_SETUP'; patch: Partial<LayoutV3['page']> }
  | { type: 'UPDATE_ZONES'; patch: Partial<LayoutV3['zones']> }
  | { type: 'UPDATE_WATERMARK'; patch: Partial<LayoutV3['watermark']> }
  | { type: 'SET_MASTER_LETTERHEAD'; binding: MasterLetterheadBindingV3 | null }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_PAN'; offset: { x: number; y: number } }
  | { type: 'SET_ACTIVE_LEFT_TAB'; tab: LeftRailTabId }
  | { type: 'SET_ACTIVE_INSPECTOR_TAB'; tab: InspectorTabId }
  | { type: 'SET_MOBILE_PANEL'; panel: 'left' | 'right' | null }
  | { type: 'SET_SAMPLE_MODE'; enabled: boolean }
  | { type: 'SET_CURSOR_MM'; coords: { xMm: number; yMm: number } | null }
  | { type: 'SET_SMART_GUIDES'; guides: SnapGuideLine[] }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'COPY_SELECTED' }
  | { type: 'PASTE' }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS'; newRevision: number }
  | { type: 'SAVE_CONFLICT'; serverRevision: number; message: string }
  | { type: 'SAVE_ERROR'; error: string }
  | { type: 'RESOLVE_CONFLICT_RELOAD'; layout: LayoutV3; revision: number }
  | { type: 'TABLE_INSERT_ROW'; elementId: string; atIndex: number; position: 'above' | 'below' }
  | { type: 'TABLE_DELETE_ROW'; elementId: string; rowIndex: number }
  | { type: 'TABLE_INSERT_COLUMN'; elementId: string; atIndex: number; position: 'left' | 'right' }
  | { type: 'TABLE_DELETE_COLUMN'; elementId: string; colIndex: number }
  | { type: 'TABLE_MERGE_CELLS'; elementId: string; selectedCells: Array<{ row: number; column: number }> }
  | { type: 'TABLE_SPLIT_CELL'; elementId: string; row: number; column: number }
  | { type: 'TABLE_UPDATE_CELL'; elementId: string; row: number; column: number; patch: Partial<TableCellV3> }
  | { type: 'TABLE_RESIZE_COLUMN_TRANSIENT'; elementId: string; colIndex: number; deltaMm: number }
  | { type: 'TABLE_UPDATE_STYLE'; elementId: string; patch: Partial<TableStyleV3> }
  | { type: 'TABLE_SET_BINDING'; elementId: string; binding: TableDatasetBindingV3 }
