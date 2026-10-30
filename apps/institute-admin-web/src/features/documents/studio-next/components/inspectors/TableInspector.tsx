import React, { useState } from 'react'
import type {
  TableElementV3,
  StaticTableElementV3,
  DynamicTableElementV3,
  TableCellV3,
  TableStyleV3,
} from '@campusone/document-engine'
import {
  canMergeCells,
  mergeCells,
  splitCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  updateCell,
  updateTableStyle,
  CANONICAL_DATASETS,
} from '@campusone/document-engine'
import { TableDataBindingModal } from '../modals/TableDataBindingModal'

export interface TableInspectorProps {
  element: TableElementV3
  disabled?: boolean
  onUpdate: (patch: Partial<TableElementV3>) => void
}

export function TableInspector({
  element,
  disabled = false,
  onUpdate,
}: TableInspectorProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCellCoord, setSelectedCellCoord] = useState<{ row: number; column: number }>({ row: 0, column: 0 })

  const isStatic = element.mode === 'static'
  const staticEl = element as StaticTableElementV3
  const dynamicEl = element as DynamicTableElementV3
  const tableStyle: TableStyleV3 = element.tableStyle || {}

  const activeCell: TableCellV3 | undefined = isStatic
    ? staticEl.cells?.find((c) => c.row === selectedCellCoord.row && c.column === selectedCellCoord.column)
    : undefined

  const handleModeSwitch = (mode: 'static' | 'dynamic') => {
    if (mode === element.mode) return
    if (mode === 'dynamic') {
      onUpdate({
        mode: 'dynamic',
        datasetId: 'academics.exam_marks',
        datasetBinding: {
          datasetName: 'academics.exam_marks',
          totalsRow: { enabled: true, label: 'Total' },
        },
      } as any)
    } else {
      onUpdate({
        mode: 'static',
        rowCount: 3,
        colCount: 3,
        rows: [
          { id: 'r1', heightMm: 8, isHeader: true },
          { id: 'r2', heightMm: 8 },
          { id: 'r3', heightMm: 8 },
        ],
        columns: [
          { id: 'c1', header: 'Col 1', widthPercent: 33.33 },
          { id: 'c2', header: 'Col 2', widthPercent: 33.33 },
          { id: 'c3', header: 'Col 3', widthPercent: 33.34 },
        ],
        cells: [
          { id: 'c_0_0', row: 0, column: 0, content: 'Header 1' },
          { id: 'c_0_1', row: 0, column: 1, content: 'Header 2' },
          { id: 'c_0_2', row: 0, column: 2, content: 'Header 3' },
          { id: 'c_1_0', row: 1, column: 0, content: 'Data 1' },
          { id: 'c_1_1', row: 1, column: 1, content: 'Data 2' },
          { id: 'c_1_2', row: 1, column: 2, content: 'Data 3' },
          { id: 'c_2_0', row: 2, column: 0, content: 'Data 4' },
          { id: 'c_2_1', row: 2, column: 1, content: 'Data 5' },
          { id: 'c_2_2', row: 2, column: 2, content: 'Data 6' },
        ],
      } as any)
    }
  }

  const handleUpdateStyle = (patch: Partial<TableStyleV3>) => {
    const updated = updateTableStyle(element, patch)
    onUpdate({ tableStyle: updated.tableStyle })
  }

  const handleUpdateActiveCell = (patch: Partial<TableCellV3>) => {
    if (!isStatic || !activeCell) return
    const updated = updateCell(staticEl, selectedCellCoord.row, selectedCellCoord.column, patch)
    onUpdate({ cells: updated.cells })
  }

  // --- Grid Mutation Helpers ---
  const handleInsertRow = (position: 'above' | 'below') => {
    if (!isStatic) return
    const updated = insertRow(staticEl, selectedCellCoord.row, position)
    onUpdate({
      rowCount: updated.rowCount,
      heightMm: updated.heightMm,
      rows: updated.rows,
      cells: updated.cells,
    })
  }

  const handleDeleteRow = () => {
    if (!isStatic || staticEl.rowCount <= 1) return
    const updated = deleteRow(staticEl, selectedCellCoord.row)
    onUpdate({
      rowCount: updated.rowCount,
      heightMm: updated.heightMm,
      rows: updated.rows,
      cells: updated.cells,
    })
    setSelectedCellCoord((prev) => ({
      ...prev,
      row: Math.min(prev.row, updated.rowCount - 1),
    }))
  }

  const handleInsertCol = (position: 'left' | 'right') => {
    if (!isStatic) return
    const updated = insertColumn(staticEl, selectedCellCoord.column, position)
    onUpdate({
      colCount: updated.colCount,
      columns: updated.columns,
      cells: updated.cells,
    })
  }

  const handleDeleteCol = () => {
    if (!isStatic || staticEl.colCount <= 1) return
    const updated = deleteColumn(staticEl, selectedCellCoord.column)
    onUpdate({
      colCount: updated.colCount,
      columns: updated.columns,
      cells: updated.cells,
    })
    setSelectedCellCoord((prev) => ({
      ...prev,
      column: Math.min(prev.column, updated.colCount - 1),
    }))
  }

  const handleMerge2x2 = () => {
    if (!isStatic) return
    const r = selectedCellCoord.row
    const c = selectedCellCoord.column
    if (r + 1 < staticEl.rowCount && c + 1 < staticEl.colCount) {
      const selection = [
        { row: r, column: c },
        { row: r, column: c + 1 },
        { row: r + 1, column: c },
        { row: r + 1, column: c + 1 },
      ]
      if (canMergeCells(staticEl, selection)) {
        const updated = mergeCells(staticEl, selection)
        onUpdate({ cells: updated.cells })
      }
    }
  }

  const handleSplitCell = () => {
    if (!isStatic) return
    const updated = splitCell(staticEl, selectedCellCoord.row, selectedCellCoord.column)
    onUpdate({ cells: updated.cells })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mode Selection */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Table Mode</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`sn-btn ${isStatic ? 'sn-btn-primary' : ''}`}
            style={{ flex: 1, fontSize: 11, height: 28 }}
            disabled={disabled}
            onClick={() => handleModeSwitch('static')}
          >
            Static Grid
          </button>
          <button
            type="button"
            className={`sn-btn ${!isStatic ? 'sn-btn-primary' : ''}`}
            style={{ flex: 1, fontSize: 11, height: 28 }}
            disabled={disabled}
            onClick={() => handleModeSwitch('dynamic')}
          >
            Dynamic Dataset
          </button>
        </div>
      </div>

      {/* Dynamic Mode: Dataset Binding Controls */}
      {!isStatic && (
        <div className="sn-inspector-section">
          <div className="sn-section-header">Dataset Binding</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>Bound Dataset:</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1D4ED8',
                  background: '#EFF6FF',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid #BFDBFE',
                }}
              >
                {dynamicEl.datasetBinding?.datasetName || dynamicEl.datasetId || 'Not set'}
              </span>
            </div>

            <button
              type="button"
              className="sn-btn sn-btn-primary"
              style={{ fontSize: 11, height: 28, width: '100%' }}
              disabled={disabled}
              onClick={() => setModalOpen(true)}
            >
              Configure Dataset Binding...
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="dynamic-totals-chk"
                checked={dynamicEl.datasetBinding?.totalsRow?.enabled ?? false}
                disabled={disabled}
                onChange={(e) => {
                  const currentBinding = dynamicEl.datasetBinding || { datasetName: dynamicEl.datasetId || 'academics.exam_marks' }
                  onUpdate({
                    datasetBinding: {
                      ...currentBinding,
                      totalsRow: {
                        enabled: e.target.checked,
                        label: 'Total',
                        cells: e.target.checked ? [{ column: 0, content: 'Total' }] : undefined,
                      },
                    },
                  })
                }}
              />
              <label htmlFor="dynamic-totals-chk" style={{ fontSize: 11, color: '#334155' }}>
                Show Totals Row at Bottom
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Static Mode: Grid Dimensions & Row/Col Operations */}
      {isStatic && (
        <div className="sn-inspector-section">
          <div className="sn-section-header">Grid Dimensions & Slices</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span>Rows: <strong>{staticEl.rowCount}</strong></span>
            <span>Columns: <strong>{staticEl.colCount}</strong></span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              className="sn-btn"
              style={{ fontSize: 11, height: 26 }}
              disabled={disabled}
              onClick={() => handleInsertRow('above')}
            >
              + Row Above
            </button>
            <button
              type="button"
              className="sn-btn"
              style={{ fontSize: 11, height: 26 }}
              disabled={disabled}
              onClick={() => handleInsertRow('below')}
            >
              + Row Below
            </button>
            <button
              type="button"
              className="sn-btn"
              style={{ fontSize: 11, height: 26 }}
              disabled={disabled}
              onClick={() => handleInsertCol('left')}
            >
              + Col Left
            </button>
            <button
              type="button"
              className="sn-btn"
              style={{ fontSize: 11, height: 26 }}
              disabled={disabled}
              onClick={() => handleInsertCol('right')}
            >
              + Col Right
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="sn-btn"
              style={{ flex: 1, fontSize: 11, height: 26, color: '#DC2626' }}
              disabled={disabled || staticEl.rowCount <= 1}
              onClick={handleDeleteRow}
            >
              🗑 Delete Row
            </button>
            <button
              type="button"
              className="sn-btn"
              style={{ flex: 1, fontSize: 11, height: 26, color: '#DC2626' }}
              disabled={disabled || staticEl.colCount <= 1}
              onClick={handleDeleteCol}
            >
              🗑 Delete Col
            </button>
          </div>
        </div>
      )}

      {/* Static Mode: Cell Selection & Merge/Split */}
      {isStatic && (
        <div className="sn-inspector-section">
          <div className="sn-section-header">Selected Cell & Merge</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748B' }}>Active Cell:</span>
            <select
              className="sn-select"
              style={{ flex: 1, height: 26, fontSize: 11 }}
              value={`${selectedCellCoord.row}:${selectedCellCoord.column}`}
              onChange={(e) => {
                const [r, c] = e.target.value.split(':').map(Number)
                setSelectedCellCoord({ row: r, column: c })
              }}
            >
              {Array.from({ length: staticEl.rowCount }).map((_, r) =>
                Array.from({ length: staticEl.colCount }).map((_, c) => (
                  <option key={`${r}:${c}`} value={`${r}:${c}`}>
                    Row {r + 1}, Col {c + 1}
                  </option>
                )),
              )}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="sn-btn"
              style={{ flex: 1, fontSize: 11, height: 26 }}
              disabled={disabled}
              onClick={handleMerge2x2}
              title="Merge 2x2 cells starting at current selection"
            >
              ⊞ Merge 2×2
            </button>
            <button
              type="button"
              className="sn-btn"
              style={{ flex: 1, fontSize: 11, height: 26 }}
              disabled={disabled || (!activeCell?.rowSpan && !activeCell?.colSpan)}
              onClick={handleSplitCell}
            >
              ⊟ Split Cell
            </button>
          </div>

          {activeCell && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <span className="sn-field-label">Cell Content & Tokens</span>
              <input
                type="text"
                className="sn-input"
                disabled={disabled}
                value={typeof activeCell.content === 'string' ? activeCell.content : ''}
                onChange={(e) => handleUpdateActiveCell({ content: e.target.value })}
                placeholder="Content or {{token}}"
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span className="sn-field-label">Font Size (pt)</span>
                  <input
                    type="number"
                    className="sn-input"
                    disabled={disabled}
                    value={activeCell.style?.fontSizePt || 9}
                    onChange={(e) =>
                      handleUpdateActiveCell({
                        style: { ...activeCell.style, fontSizePt: parseFloat(e.target.value) || 9 },
                      })
                    }
                  />
                </div>
                <div>
                  <span className="sn-field-label">Alignment</span>
                  <select
                    className="sn-select"
                    disabled={disabled}
                    value={activeCell.align || 'left'}
                    onChange={(e) => handleUpdateActiveCell({ align: e.target.value as any })}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="sn-field-label">Cell Fill Color</span>
                <input
                  type="color"
                  disabled={disabled}
                  value={activeCell.backgroundColor || '#FFFFFF'}
                  onChange={(e) => handleUpdateActiveCell({ backgroundColor: e.target.value })}
                  style={{ width: 36, height: 24, border: 'none', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Table Styling & Zebra Striping */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Appearance & Striping</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sn-field-label">Header Background</span>
            <input
              type="color"
              disabled={disabled}
              value={tableStyle.headerBackground || '#173A5E'}
              onChange={(e) => handleUpdateStyle({ headerBackground: e.target.value })}
              style={{ width: 36, height: 24, border: 'none', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sn-field-label">Header Text Color</span>
            <input
              type="color"
              disabled={disabled}
              value={tableStyle.headerTextColor || '#FFFFFF'}
              onChange={(e) => handleUpdateStyle({ headerTextColor: e.target.value })}
              style={{ width: 36, height: 24, border: 'none', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="tbl-zebra-chk"
              checked={tableStyle.striped !== false}
              disabled={disabled}
              onChange={(e) => handleUpdateStyle({ striped: e.target.checked })}
            />
            <label htmlFor="tbl-zebra-chk" style={{ fontSize: 11, color: '#334155' }}>
              Alternating Zebra Striping
            </label>
          </div>

          {tableStyle.striped !== false && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="sn-field-label">Stripe Tint (Odd Rows)</span>
              <input
                type="color"
                disabled={disabled}
                value={tableStyle.stripeOddColor || '#F8FAFC'}
                onChange={(e) => handleUpdateStyle({ stripeOddColor: e.target.value })}
                style={{ width: 36, height: 24, border: 'none', cursor: 'pointer' }}
              />
            </div>
          )}

          <div>
            <span className="sn-field-label">Gridlines Preset</span>
            <select
              className="sn-select"
              disabled={disabled}
              value={tableStyle.borderPreset || 'grid'}
              onChange={(e) => handleUpdateStyle({ borderPreset: e.target.value as any })}
            >
              <option value="grid">All Gridlines</option>
              <option value="horizontal-only">Horizontal Lines Only</option>
              <option value="outer-only">Outer Box Only</option>
              <option value="none">No Borders</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sn-field-label">Gridline Color</span>
            <input
              type="color"
              disabled={disabled}
              value={tableStyle.borderColor || '#CBD5E1'}
              onChange={(e) => handleUpdateStyle({ borderColor: e.target.value })}
              style={{ width: 36, height: 24, border: 'none', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Dataset Binding Modal */}
      {modalOpen && (
        <TableDataBindingModal
          isOpen={modalOpen}
          currentBinding={dynamicEl.datasetBinding}
          currentColumns={dynamicEl.columns}
          onClose={() => setModalOpen(false)}
          onApply={(binding, cols) => {
            onUpdate({
              mode: 'dynamic',
              datasetId: binding.datasetName,
              datasetBinding: binding,
              columns: cols,
            } as any)
          }}
        />
      )}
    </div>
  )
}
