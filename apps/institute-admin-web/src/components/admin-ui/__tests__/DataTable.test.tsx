import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataTable, type DataTableColumn, type TableSort } from '../DataTable'

interface Person { id: string; name: string; status: string }
const rows: Person[] = [{ id: '1', name: 'Asha Rao', status: 'Active' }, { id: '2', name: 'Dev Shah', status: 'Inactive' }]
const columns: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Name', sortable: true, cell: (row) => row.name },
  { id: 'status', header: 'Status', cell: (row) => row.status, hideOnSmall: true },
]

function TableHarness({ onSort = vi.fn(), onRemoveFilter = vi.fn() }: { onSort?: (sort: TableSort) => void; onRemoveFilter?: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  return <DataTable caption="People" columns={columns} rows={rows} getRowId={(row) => row.id} rowLabel={(row) => row.name} selectedRowIds={selected} onSelectionChange={setSelected} bulkActions={<button type="button">Archive</button>} sort={{ columnId: 'name', direction: 'asc' }} onSortChange={onSort} filters={<input aria-label="Search people" />} activeFilters={[{ id: 'status', label: 'Status', value: 'Active', onRemove: onRemoveFilter }]} totalRows={60} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
}

describe('DataTable', () => {
  it('uses semantic table controls and handles sort, selection, filters, and pagination', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    const onRemoveFilter = vi.fn()
    render(<TableHarness onSort={onSort} onRemoveFilter={onRemoveFilter} />)

    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: /sort by name/i }))
    expect(onSort).toHaveBeenCalledWith({ columnId: 'name', direction: 'desc' })

    await user.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }))
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected')
    expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: /select all rows/i }))
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('2 selected')

    await user.click(screen.getByRole('button', { name: 'Remove filter Status: Active' }))
    expect(onRemoveFilter).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Showing 26–50 of 60')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: /rows per page/i }), '50')
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('renders loading, empty, and recoverable error states', () => {
    const base = { caption: 'People', columns, rows: [] as Person[], getRowId: (row: Person) => row.id, totalRows: 0, page: 1, pageSize: 25 as const, onPageChange: vi.fn(), onPageSizeChange: vi.fn() }
    const { rerender } = render(<DataTable {...base} loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading People')

    rerender(<DataTable {...base} emptyTitle="No people yet" emptyAction={<button type="button">Add person</button>} />)
    expect(screen.getByRole('heading', { name: 'No people yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add person' })).toBeInTheDocument()

    const retry = vi.fn()
    rerender(<DataTable {...base} error="People could not be loaded" onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('People could not be loaded')
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
