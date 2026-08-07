import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { DataTable, type DataTableColumn } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'

type Branch = { id: string; name: string }
type Enquiry = { id: string; guardianName: string; contactEmail: string; status: string; branchId: string | null; createdAt: string }
const emptyPage = <T,>(): PageData<T> => ({ count: 0, page: 1, pageSize: 0, totalPages: 1, next: null, previous: null, items: [] })
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function EnquiriesPage({ accessToken, branches, selectedBranch }: { accessToken: string; branches: Branch[]; selectedBranch: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<PageData<Enquiry>>(emptyPage)
  const [loadedQuery, setLoadedQuery] = useState('')
  const [listError, setListError] = useState('')
  const [actionError, setActionError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const queryKey = [accessToken, selectedBranch, page, pageSize, search.trim(), revision].join('|')

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    if (search.trim()) params.set('search', search.trim())
    void adminRequest<PageData<Enquiry>>(accessToken, `enquiries?${params}`, { signal: controller.signal })
      .then((response) => { setData(response); setListError(''); setLoadedQuery(queryKey) })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setListError(cause instanceof Error ? cause.message : 'Enquiries could not be loaded.'); setLoadedQuery(queryKey) } })
    return () => controller.abort()
  }, [accessToken, page, pageSize, queryKey, revision, search, selectedBranch])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setActionError('')
    try {
      await adminRequest<Enquiry>(accessToken, 'enquiries', { method: 'POST', body: JSON.stringify({ guardianName: form.get('guardianName'), contactEmail: form.get('contactEmail'), branchId: form.get('branchId') || null, status: form.get('status') }) })
      setShowForm(false)
      setPage(1)
      setRevision((value) => value + 1)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Enquiry could not be created.') } finally { setSaving(false) }
  }

  const columns: DataTableColumn<Enquiry>[] = [
    { id: 'guardian', header: 'Parent or guardian', cell: (item) => item.guardianName },
    { id: 'email', header: 'Email', cell: (item) => item.contactEmail || '—' },
    { id: 'status', header: 'Status', cell: (item) => item.status.replaceAll('_', ' ') },
    { id: 'created', header: 'Created', cell: (item) => dateFormatter.format(new Date(item.createdAt)) },
    { id: 'actions', header: <span className="sr-only">Actions</span>, align: 'end', cell: (item) => <button className="button-secondary" type="button" onClick={() => navigate(`/admissions/enquiries/detail?enquiry=${item.id}`)}>View</button> },
  ]
  const queryLoaded = loadedQuery === queryKey

  return <div className="entity-page">
    <div className="page-heading"><div><p className="breadcrumb">Admissions CRM / Enquiries</p><h1>Enquiries</h1></div><button className="button-primary" type="button" onClick={() => setShowForm((value) => !value)}><Plus />Add Enquiry</button></div>
    {actionError && <div className="inline-error" role="alert">{actionError}</div>}
    {showForm && <Card><SectionHeader title="Add enquiry" /><form className="entity-form entity-form-inline" onSubmit={create}>
      <label>Parent or guardian name<input name="guardianName" required maxLength={200} /></label>
      <label>Work email<input name="contactEmail" type="email" /></label>
      <input type="hidden" name="branchId" value={selectedBranch === 'all' ? '' : selectedBranch} />
      <label>Status<select name="status" defaultValue="ENQUIRY"><option value="ENQUIRY">New enquiry</option><option value="VISIT_SCHEDULED">Visit scheduled</option><option value="APPLIED">Applied</option><option value="ENROLLED">Enrolled</option><option value="LOST">Lost</option></select></label>
      <div className="form-actions"><button className="button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Create enquiry'}</button></div>
    </form></Card>}
    <Card className="entity-table-card"><SectionHeader title={`Enquiries (${queryLoaded ? data.count : 0})`} /><DataTable caption="Enquiries" columns={columns} rows={queryLoaded ? data.items : []} getRowId={(item) => item.id} rowLabel={(item) => item.guardianName} totalRows={queryLoaded ? data.count : 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} loading={!queryLoaded} error={queryLoaded && listError ? listError : undefined} onRetry={() => setRevision((value) => value + 1)} filters={<label className="search-control"><Search aria-hidden="true" /><span className="sr-only">Search enquiries</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search enquiries" /></label>} emptyTitle="No enquiries found" emptyDescription={search ? 'Try a different search.' : 'Add a walk-in or manual lead to begin tracking admissions.'} /></Card>
  </div>
}
