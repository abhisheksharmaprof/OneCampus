import { FormEvent, useEffect, useState } from 'react'
import { CalendarPlus, Search } from 'lucide-react'
import { DataTable, Modal, type DataTableColumn } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'

type Branch = { id: string; name: string }
type Event = { id: string; title: string; eventType: string; branchId: string | null; startsOn: string; endsOn: string }
const emptyPage = <T,>(): PageData<T> => ({ count: 0, page: 1, pageSize: 0, totalPages: 1, next: null, previous: null, items: [] })

const toIsoDate = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text
}

export function CalendarPage({ accessToken, branches, selectedBranch }: { accessToken: string; branches: Branch[]; selectedBranch: string }) {
  const [data, setData] = useState<PageData<Event>>(emptyPage)
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
    void adminRequest<PageData<Event>>(accessToken, `calendar/events?${params}`, { signal: controller.signal })
      .then((response) => { setData(response); setListError(''); setLoadedQuery(queryKey) })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setListError(cause instanceof Error ? cause.message : 'Academic calendar could not be loaded.'); setLoadedQuery(queryKey) } })
    return () => controller.abort()
  }, [accessToken, page, pageSize, queryKey, revision, search, selectedBranch])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setActionError('')
    try {
      await adminRequest<Event>(accessToken, 'calendar/events', { method: 'POST', body: JSON.stringify({ title: form.get('title'), eventType: form.get('eventType'), branchId: form.get('branchId') || null, startsOn: toIsoDate(form.get('startsOn')), endsOn: toIsoDate(form.get('endsOn')) }) })
      setShowForm(false)
      setPage(1)
      setRevision((value) => value + 1)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Event could not be created.') } finally { setSaving(false) }
  }

  const columns: DataTableColumn<Event>[] = [
    { id: 'event', header: 'Event', cell: (item) => item.title },
    { id: 'type', header: 'Type', cell: (item) => item.eventType },
    { id: 'schedule', header: 'Schedule', cell: (item) => item.startsOn === item.endsOn ? item.startsOn : `${item.startsOn} – ${item.endsOn}` },
  ]
  const queryLoaded = loadedQuery === queryKey

  return <div className="entity-page">
    <div className="page-heading institute-subpage-heading"><div><p className="breadcrumb">Institute Setup / Holidays &amp; Calendar</p><h1>Holidays &amp; Calendar</h1><p className="page-subtitle">Annual holiday calendar. Attendance is automatically marked as holiday on these dates.</p></div><button className="button-primary" type="button" onClick={() => setShowForm((value) => !value)}><CalendarPlus />Add Holiday</button></div>
    {actionError && <div className="inline-error" role="alert">{actionError}</div>}
    <Modal open={showForm} title="Add calendar event" description="Create an institute-wide or campus-specific holiday, exam, PTM, or event." onClose={() => { if (!saving) setShowForm(false) }} footer={<><button className="button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button-primary" form="calendar-event-form" disabled={saving}>{saving ? 'Saving…' : 'Create event'}</button></>}><form id="calendar-event-form" className="admin-form-grid" onSubmit={create}>
      <label>Event title<input name="title" required maxLength={250} /></label><label>Type<select name="eventType" defaultValue="EVENT"><option value="EVENT">Event</option><option value="EXAM">Exam</option><option value="HOLIDAY">Holiday</option><option value="PTM">Parent-teacher meeting</option></select></label><input type="hidden" name="branchId" value={selectedBranch === 'all' ? '' : selectedBranch} /><label>Starts on<input name="startsOn" type="date" required /></label><label>Ends on<input name="endsOn" type="date" required /></label>
    </form></Modal>
    <Card className="entity-table-card"><SectionHeader title={`Scheduled events (${queryLoaded ? data.count : 0})`} /><DataTable caption="Scheduled events" columns={columns} rows={queryLoaded ? data.items : []} getRowId={(item) => item.id} rowLabel={(item) => item.title} totalRows={queryLoaded ? data.count : 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} loading={!queryLoaded} error={queryLoaded && listError ? listError : undefined} onRetry={() => setRevision((value) => value + 1)} filters={<label className="search-control"><Search aria-hidden="true" /><span className="sr-only">Search calendar events</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search calendar events" /></label>} emptyTitle="No calendar events found" emptyDescription={search ? 'Try a different search.' : 'Add holidays, exams, PTMs, and institute events here.'} /></Card>
  </div>
}
