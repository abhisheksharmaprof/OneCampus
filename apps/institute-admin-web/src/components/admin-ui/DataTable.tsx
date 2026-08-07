import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { BoneScreen, EmptyState, ErrorState, Skeleton } from './Feedback'

export type SortDirection = 'asc' | 'desc'
export interface TableSort { columnId: string; direction: SortDirection }

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortLabel?: string
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
  width?: string
  hideOnSmall?: boolean
}

export interface ActiveFilter {
  id: string
  label: string
  value: string
  onRemove: () => void
}

export interface DataTableProps<T> {
  caption: string
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  sort?: TableSort
  onSortChange?: (sort: TableSort) => void
  filters?: ReactNode
  activeFilters?: readonly ActiveFilter[]
  toolbarActions?: ReactNode
  selectedRowIds?: ReadonlySet<string>
  onSelectionChange?: (ids: Set<string>) => void
  bulkActions?: ReactNode
  totalRows: number
  page: number
  pageSize: 25 | 50 | 100
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: 25 | 50 | 100) => void
  loading?: boolean
  error?: ReactNode
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  rowLabel?: (row: T) => string
}

function SelectionCheckbox({ checked, indeterminate, label, onChange }: { checked: boolean; indeterminate?: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = Boolean(indeterminate) }, [indeterminate])
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange} />
}

export function DataTable<T>({ caption, columns, rows, getRowId, onRowClick, sort, onSortChange, filters, activeFilters = [], toolbarActions, selectedRowIds, onSelectionChange, bulkActions, totalRows, page, pageSize, onPageChange, onPageSizeChange, loading = false, error, onRetry, emptyTitle = 'No records found', emptyDescription, emptyAction, rowLabel }: DataTableProps<T>) {
  const tableId = useId()
  const selectionEnabled = Boolean(selectedRowIds && onSelectionChange)
  const rowIds = useMemo(() => rows.map(getRowId), [getRowId, rows])
  const selectedOnPage = selectionEnabled ? rowIds.filter((id) => selectedRowIds?.has(id)) : []
  const allOnPageSelected = rowIds.length > 0 && selectedOnPage.length === rowIds.length
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(Math.max(page, 1), pageCount)
  const firstRow = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1
  const lastRow = Math.min(safePage * pageSize, totalRows)

  const updateSelection = (ids: string[], selected: boolean) => {
    if (!selectedRowIds || !onSelectionChange) return
    const next = new Set(selectedRowIds)
    ids.forEach((id) => selected ? next.add(id) : next.delete(id))
    onSelectionChange(next)
  }

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !onSortChange) return
    const direction: SortDirection = sort?.columnId === column.id && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ columnId: column.id, direction })
  }

  const getSortLabel = (column: DataTableColumn<T>) => column.sortLabel ?? (typeof column.header === 'string' ? column.header : column.id)

  return (
    <section className="admin-data-table" aria-labelledby={`${tableId}-caption`}>
      {(filters || toolbarActions) ? <div className="admin-table-toolbar">{filters ? <div className="admin-filter-controls" aria-label="Table filters">{filters}</div> : <span />}{toolbarActions ? <div className="admin-table-toolbar__actions">{toolbarActions}</div> : null}</div> : null}
      {activeFilters.length ? <div className="admin-filter-chips" aria-label="Active filters">{activeFilters.map((filter) => <button type="button" key={filter.id} onClick={filter.onRemove} aria-label={`Remove filter ${filter.label}: ${filter.value}`}><span>{filter.label}: <strong>{filter.value}</strong></span><X aria-hidden="true" /></button>)}</div> : null}
      {selectionEnabled && (selectedRowIds?.size ?? 0) > 0 ? <div className="admin-bulk-toolbar" role="region" aria-label="Bulk actions"><strong>{selectedRowIds?.size} selected</strong><div>{bulkActions}</div></div> : null}
      {error ? <ErrorState message={error} onRetry={onRetry} /> : rows.length === 0 && !loading ? <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} /> : (
        <BoneScreen name={`table-${caption.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} loading={loading} label={`Loading ${caption}`}>
        <div className="admin-table-scroll" tabIndex={0} aria-label={`Scrollable ${caption} table`}>
          <table>
            <caption className="admin-sr-only" id={`${tableId}-caption`}>{caption}</caption>
            <thead><tr>
              {selectionEnabled ? <th className="admin-table__select" scope="col"><SelectionCheckbox checked={allOnPageSelected} indeterminate={selectedOnPage.length > 0 && !allOnPageSelected} label={allOnPageSelected ? 'Deselect all rows on this page' : 'Select all rows on this page'} onChange={() => updateSelection(rowIds, !allOnPageSelected)} /></th> : null}
              {columns.map((column) => {
                const activeSort = sort?.columnId === column.id ? sort.direction : undefined
                return <th key={column.id} scope="col" aria-sort={activeSort ? (activeSort === 'asc' ? 'ascending' : 'descending') : column.sortable ? 'none' : undefined} className={`${column.align ? `is-${column.align}` : ''} ${column.hideOnSmall ? 'admin-table__small-hidden' : ''}`.trim()} style={{ width: column.width }}>{column.sortable ? <button type="button" onClick={() => toggleSort(column)} aria-label={`Sort by ${getSortLabel(column)}${activeSort ? `, currently ${activeSort === 'asc' ? 'ascending' : 'descending'}` : ''}`}>{column.header}{activeSort === 'asc' ? <ChevronUp /> : activeSort === 'desc' ? <ChevronDown /> : <ChevronsUpDown />}</button> : column.header}</th>
              })}
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: Math.min(pageSize, 5) }, (_, rowIndex) => <tr key={`loading-${rowIndex}`} aria-hidden="true">{selectionEnabled ? <td><Skeleton width="1rem" height="1rem" /></td> : null}{columns.map((column) => <td key={column.id}><Skeleton width={rowIndex % 2 ? '70%' : '90%'} height="0.875rem" /></td>)}</tr>) : rows.map((row) => {
                const rowId = getRowId(row)
                const selected = selectedRowIds?.has(rowId) ?? false
                return <tr
                  key={rowId}
                  data-selected={selected || undefined}
                  data-clickable={onRowClick ? 'true' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onRowClick(row)
                    }
                  } : undefined}
                >
                  {selectionEnabled ? <td className="admin-table__select" onClick={(event) => event.stopPropagation()}><SelectionCheckbox checked={selected} label={`Select ${rowLabel?.(row) ?? `row ${rowId}`}`} onChange={() => updateSelection([rowId], !selected)} /></td> : null}
                  {columns.map((column) => <td key={column.id} data-label={typeof column.header === 'string' ? column.header : column.sortLabel} className={`${column.align ? `is-${column.align}` : ''} ${column.hideOnSmall ? 'admin-table__small-hidden' : ''}`.trim()}>{column.cell(row)}</td>)}
                </tr>
              })}
            </tbody>
          </table>
          {loading ? <span className="admin-sr-only">Loading {caption}</span> : null}
        </div>
        </BoneScreen>
      )}
      {!error ? <div className="admin-pagination" aria-label="Pagination"><p aria-live="polite">Showing {firstRow}–{lastRow} of {totalRows}</p><label>Rows per page<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as 25 | 50 | 100)}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><div className="admin-pagination__buttons"><button type="button" aria-label="Previous page" disabled={safePage <= 1 || loading} onClick={() => onPageChange(safePage - 1)}><ChevronLeft aria-hidden="true" /></button><span>Page {safePage} of {pageCount}</span><button type="button" aria-label="Next page" disabled={safePage >= pageCount || loading} onClick={() => onPageChange(safePage + 1)}><ChevronRight aria-hidden="true" /></button></div></div> : null}
    </section>
  )
}
