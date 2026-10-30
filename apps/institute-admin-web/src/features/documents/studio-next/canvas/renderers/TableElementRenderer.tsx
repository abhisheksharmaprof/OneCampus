import React, { useState, useRef, useEffect } from 'react'
import type {
  TableElementV3,
  StaticTableElementV3,
  DynamicTableElementV3,
} from '@campusone/document-engine'
import {
  compileCellBorderCss,
  resolveDatasetName,
  getSampleDataset,
  evaluateTotalsFormula,
  interpolateTokens,
} from '@campusone/document-engine'
import { PX_PER_MM } from '../../constants'

export interface TableElementRendererProps {
  element: TableElementV3
  zoom: number
  sampleMode?: boolean
  sampleData?: Record<string, unknown>
  selectedCell?: { row: number; column: number } | null
  onSelectCell?: (row: number, column: number) => void
  onResizeColumn?: (colIndex: number, deltaMm: number) => void
  onCommitResize?: () => void
  onUpdateCellContent?: (row: number, column: number, content: string) => void
}

export function TableElementRenderer({
  element,
  zoom,
  sampleMode = true,
  sampleData = {},
  selectedCell,
  onSelectCell,
  onResizeColumn,
  onCommitResize,
  onUpdateCellContent,
}: TableElementRendererProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; column: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const handleCellDoubleClick = (row: number, column: number, currentContent: string) => {
    setEditingCell({ row, column })
    setEditValue(currentContent)
  }

  const handleFinishEditing = () => {
    if (editingCell && onUpdateCellContent) {
      onUpdateCellContent(editingCell.row, editingCell.column, editValue)
    }
    setEditingCell(null)
  }

  const handleDividerPointerDown = (colIndex: number, e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const handlePointerMove = (moveEv: PointerEvent) => {
      const deltaPx = moveEv.clientX - startX
      const deltaMm = deltaPx / (PX_PER_MM * zoom)
      if (onResizeColumn) {
        onResizeColumn(colIndex, deltaMm)
      }
    }

    const handlePointerUp = () => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
      if (onCommitResize) {
        onCommitResize()
      }
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', handlePointerUp)
  }

  // --- Static Table Rendering ---
  if (element.mode === 'static') {
    const staticEl = element as StaticTableElementV3
    const style = staticEl.tableStyle || {}
    const cells = staticEl.cells || []

    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <table
          style={{
            width: '100%',
            height: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            boxSizing: 'border-box',
          }}
        >
          <colgroup>
            {staticEl.columns.map((col, idx) => (
              <col
                key={col.id || idx}
                style={{ width: `${col.widthPercent ?? 100 / staticEl.colCount}%` }}
              />
            ))}
          </colgroup>
          <tbody>
            {Array.from({ length: staticEl.rowCount }).map((_, r) => {
              const isHeaderRow = staticEl.rows[r]?.isHeader || (r === 0 && style.hasHeader)
              return (
                <tr key={r} style={{ height: staticEl.rows[r]?.heightMm ? `${staticEl.rows[r].heightMm! * PX_PER_MM * zoom}px` : undefined }}>
                  {Array.from({ length: staticEl.colCount }).map((_, c) => {
                    const cell = cells.find((item) => item.row === r && item.column === c)
                    if (!cell || cell.isMergedCovered) return null

                    const isSelected = selectedCell?.row === r && selectedCell?.column === c
                    const isEditing = editingCell?.row === r && editingCell?.column === c

                    let bg = cell.backgroundColor
                    if (!bg) {
                      if (isHeaderRow) {
                        bg = style.headerBackground || '#173A5E'
                      } else if (style.striped !== false) {
                        bg = r % 2 === 1 ? (style.stripeOddColor || '#F8FAFC') : (style.stripeEvenColor || '#FFFFFF')
                      } else {
                        bg = '#FFFFFF'
                      }
                    }

                    let textColor = cell.style?.color
                    if (!textColor) {
                      textColor = isHeaderRow ? (style.headerTextColor || '#FFFFFF') : '#1E293B'
                    }

                    const pad = cell.paddingMm || style.defaultPaddingMm || { topMm: 2, rightMm: 2.5, bottomMm: 2, leftMm: 2.5 }
                    const padTopPx = pad.topMm * PX_PER_MM * zoom
                    const padRightPx = pad.rightMm * PX_PER_MM * zoom
                    const padBottomPx = pad.bottomMm * PX_PER_MM * zoom
                    const padLeftPx = pad.leftMm * PX_PER_MM * zoom

                    const borderStyle = compileCellBorderCss(
                      cell.border,
                      style.borderPreset,
                      style.borderColor,
                      style.borderWidthMm,
                    )

                    const fontSizePx = (cell.style?.fontSizePt || (isHeaderRow ? (style.headerFontSizePt ?? 9.5) : 9)) * (96 / 72) * zoom

                    const rawContent = typeof cell.content === 'string' ? cell.content : ''
                    const displayContent = sampleMode
                      ? interpolateTokens(rawContent, sampleData, { sampleMode: true })
                      : rawContent

                    const Tag = isHeaderRow ? 'th' : 'td'

                    return (
                      <Tag
                        key={cell.id || `${r}-${c}`}
                        rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                        colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          if (onSelectCell) onSelectCell(r, c)
                        }}
                        onDoubleClick={(ev) => {
                          ev.stopPropagation()
                          handleCellDoubleClick(r, c, rawContent)
                        }}
                        style={{
                          position: 'relative',
                          background: bg,
                          color: textColor,
                          textAlign: cell.align || 'left',
                          verticalAlign: cell.verticalAlign || 'middle',
                          padding: `${padTopPx}px ${padRightPx}px ${padBottomPx}px ${padLeftPx}px`,
                          fontSize: `${fontSizePx}px`,
                          fontWeight: cell.style?.bold || isHeaderRow ? 600 : 400,
                          fontStyle: cell.style?.italic ? 'italic' : 'normal',
                          outline: isSelected ? '2px solid #2563EB' : 'none',
                          outlineOffset: '-1px',
                          zIndex: isSelected ? 5 : 1,
                          boxSizing: 'border-box',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          ...parseInlineBorderCss(borderStyle),
                        }}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleFinishEditing}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleFinishEditing()
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              fontSize: `${fontSizePx}px`,
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              color: textColor,
                              padding: 0,
                              margin: 0,
                            }}
                          />
                        ) : (
                          displayContent
                        )}

                        {/* Column Divider Drag Handle on Column Boundary */}
                        {r === 0 && c < staticEl.colCount - 1 && onResizeColumn && (
                          <div
                            onPointerDown={(e) => handleDividerPointerDown(c, e)}
                            style={{
                              position: 'absolute',
                              right: -4,
                              top: 0,
                              bottom: 0,
                              width: 8,
                              cursor: 'col-resize',
                              zIndex: 10,
                            }}
                          />
                        )}
                      </Tag>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // --- Dynamic Table Rendering ---
  const dynamicEl = element as DynamicTableElementV3
  const style = dynamicEl.tableStyle || {}
  const headerBg = style.headerBackground || '#173A5E'
  const headerColor = style.headerTextColor || '#FFFFFF'
  const zebraColor = style.stripeOddColor || '#F8FAFC'
  const zebra = style.striped !== false
  const defaultPad = style.defaultPaddingMm || { topMm: 2, rightMm: 2.5, bottomMm: 2, leftMm: 2.5 }
  const padTopPx = defaultPad.topMm * PX_PER_MM * zoom
  const padRightPx = defaultPad.rightMm * PX_PER_MM * zoom
  const padBottomPx = defaultPad.bottomMm * PX_PER_MM * zoom
  const padLeftPx = defaultPad.leftMm * PX_PER_MM * zoom

  const borderStyle = compileCellBorderCss(
    undefined,
    style.borderPreset,
    style.borderColor,
    style.borderWidthMm,
  )
  const parsedBorder = parseInlineBorderCss(borderStyle)

  const rawDatasetName = dynamicEl.datasetBinding?.datasetName || dynamicEl.datasetId || ''
  const resolvedDatasetName = resolveDatasetName(rawDatasetName)
  const rows = getSampleDataset(resolvedDatasetName)
  const rowTemplate = dynamicEl.datasetBinding?.rowTemplate
  const fontSizePx = (style.headerFontSizePt ?? 9.5) * (96 / 72) * zoom

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          boxSizing: 'border-box',
        }}
      >
        <colgroup>
          {(dynamicEl.columns || []).map((col, idx) => (
            <col
              key={col.id || idx}
              style={{ width: `${col.widthPercent ?? col.widthPct ?? 100 / Math.max(1, dynamicEl.columns.length)}%` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: headerBg, color: headerColor }}>
            {(dynamicEl.columns || []).map((col) => (
              <th
                key={col.id}
                style={{
                  ...parsedBorder,
                  padding: `${padTopPx}px ${padRightPx}px ${padBottomPx}px ${padLeftPx}px`,
                  textAlign: col.align || 'left',
                  fontWeight: 600,
                  fontSize: `${fontSizePx}px`,
                  color: headerColor,
                  overflowWrap: 'anywhere',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows.length > 0 ? rows : [{}, {}]).slice(0, 5).map((row, rIdx) => {
            const bg = zebra && rIdx % 2 === 1 ? zebraColor : (style.stripeEvenColor || '#FFFFFF')
            return (
              <tr key={rIdx} style={{ background: bg }}>
                {(dynamicEl.columns || []).map((col, cIdx) => {
                  let content = ''
                  if (rowTemplate && rowTemplate.cells && rowTemplate.cells[cIdx]) {
                    const tpl = rowTemplate.cells[cIdx].content || ''
                    content = interpolateTokens(tpl, { ...sampleData, item: row, ...row, index: rIdx + 1 })
                  } else {
                    const raw = row[col.fieldId || col.id]
                    content = raw !== undefined && raw !== null ? String(raw) : '—'
                  }

                  return (
                    <td
                      key={col.id}
                      style={{
                        ...parsedBorder,
                        padding: `${padTopPx}px ${padRightPx}px ${padBottomPx}px ${padLeftPx}px`,
                        textAlign: col.align || 'left',
                        verticalAlign: col.verticalAlign || 'middle',
                        fontSize: `${fontSizePx * 0.9}px`,
                        color: '#1E293B',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {dynamicEl.datasetBinding?.totalsRow?.enabled && (
          <tfoot>
            <tr style={{ background: dynamicEl.datasetBinding.totalsRow.backgroundColor || '#F1F5F9' }}>
              {(dynamicEl.datasetBinding.totalsRow.cells || [{ column: 0, content: dynamicEl.datasetBinding.totalsRow.label || 'Total', colSpan: 1 }]).map((tc, tcIdx) => {
                let cellContent = tc.content || ''
                if (tc.formula) {
                  const evalVal = evaluateTotalsFormula(tc.formula, rows)
                  cellContent = tc.format === 'currency' && typeof evalVal === 'number'
                    ? `₹${evalVal.toLocaleString('en-IN')}`
                    : String(evalVal)
                }
                return (
                  <td
                    key={tcIdx}
                    colSpan={tc.colSpan && tc.colSpan > 1 ? tc.colSpan : undefined}
                    style={{
                      ...parsedBorder,
                      padding: `${padTopPx}px ${padRightPx}px ${padBottomPx}px ${padLeftPx}px`,
                      fontWeight: 700,
                      textAlign: tc.align || dynamicEl.columns[tc.column]?.align || 'left',
                      fontSize: `${fontSizePx * 0.9}px`,
                      color: '#1E293B',
                    }}
                  >
                    {cellContent}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function parseInlineBorderCss(cssString: string): React.CSSProperties {
  const result: React.CSSProperties = {}
  if (!cssString) return result

  const parts = cssString.split(';').map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const [key, val] = part.split(':').map((s) => s.trim())
    if (key === 'border') result.border = val
    else if (key === 'border-top') result.borderTop = val
    else if (key === 'border-right') result.borderRight = val
    else if (key === 'border-bottom') result.borderBottom = val
    else if (key === 'border-left') result.borderLeft = val
  }
  return result
}
