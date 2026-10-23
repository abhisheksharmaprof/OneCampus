import { FormEvent, useEffect, useState } from 'react'
import { CalendarPlus, Search } from 'lucide-react'
import { DataTable, Modal, type DataTableColumn } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'

const currentYear = new Date().getFullYear()

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
  const [showSync, setShowSync] = useState(false)
  const [syncTab, setSyncTab] = useState<'national' | 'ical'>('national')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [syncResult, setSyncResult] = useState('')
  const [saving, setSaving] = useState(false)
  const [dateRangeError, setDateRangeError] = useState('')
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const queryKey = [accessToken, selectedBranch, page, pageSize, search.trim(), revision].join('|')

  const updateDateRangeValidity = (form: HTMLFormElement) => {
    const startsOn = form.elements.namedItem('startsOn') as HTMLInputElement | null
    const endsOn = form.elements.namedItem('endsOn') as HTMLInputElement | null
    if (!startsOn || !endsOn) return true
    const message = startsOn.value && endsOn.value && endsOn.value < startsOn.value
      ? 'End date must be the same as or after the start date.'
      : ''
    endsOn.setCustomValidity(message)
    setDateRangeError(message)
    return !message
  }

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
    if (!updateDateRangeValidity(event.currentTarget) || !event.currentTarget.reportValidity()) return
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

  const sync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSyncing(true)
    setSyncError('')
    setSyncResult('')
    try {
      const body = syncTab === 'national'
        ? { country: form.get('country'), year: Number(form.get('year')), subdivision: form.get('subdivision') || undefined, branchId: selectedBranch === 'all' ? null : selectedBranch }
        : { icalUrl: String(form.get('icalUrl') ?? '').trim(), branchId: selectedBranch === 'all' ? null : selectedBranch }
      const response = await adminRequest<{ count: number; added: Event[] }>(accessToken, 'calendar/sync-holidays', { method: 'POST', body: JSON.stringify(body) })
      if (response.count === 0) setSyncResult('No new holidays to import; matching holidays already exist.')
      else setSyncResult(`Imported ${response.count} holiday${response.count === 1 ? '' : 's'}.`)
      setPage(1)
      setRevision((value) => value + 1)
    } catch (cause) { setSyncError(cause instanceof Error ? cause.message : 'Holiday sync failed. Check your details and try again.') }
    finally { setSyncing(false) }
  }

  const columns: DataTableColumn<Event>[] = [
    { id: 'event', header: 'Event', cell: (item) => item.title },
    { id: 'type', header: 'Type', cell: (item) => item.eventType },
    { id: 'schedule', header: 'Schedule', cell: (item) => item.startsOn === item.endsOn ? item.startsOn : `${item.startsOn} – ${item.endsOn}` },
  ]
  const queryLoaded = loadedQuery === queryKey

  return <div className="entity-page institute-setup-page">
    <div className="page-heading institute-subpage-heading" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}><div><p className="breadcrumb">Institute Setup / Holidays &amp; Calendar</p><h1>Holidays &amp; Calendar</h1><p className="page-subtitle">Annual holiday calendar. Attendance is automatically marked as holiday on these dates.</p></div><div className="calendar-page__actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}><button className="button-secondary" type="button" onClick={() => { setShowSync(true); setSyncError(''); setSyncResult('') }}>Sync Holidays</button><button className="button-primary" type="button" onClick={() => setShowForm(true)}><CalendarPlus aria-hidden="true" />Add Holiday</button></div></div>
    {actionError && <div className="inline-error" role="alert">{actionError}</div>}
    <Modal open={showForm} title="Add calendar event" description="Choose whether this event applies to one campus or the whole institute." onClose={() => { if (!saving) setShowForm(false) }} footer={<><button className="button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button-primary" form="calendar-event-form" disabled={saving}>{saving ? 'Saving…' : 'Create event'}</button></>}><form id="calendar-event-form" className="admin-form-grid" onSubmit={create}>
      <label>Event title<input name="title" required maxLength={250} /></label><label>Type<select name="eventType" defaultValue="EVENT"><option value="EVENT">Event</option><option value="EXAM">Exam</option><option value="HOLIDAY">Holiday</option><option value="PTM">Parent-teacher meeting</option></select></label><label>Applies to<select name="branchId" defaultValue={selectedBranch === 'all' ? '' : selectedBranch}><option value="">Institute-wide</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><small>Defaults to the selected campus. Choose Institute-wide to apply across all campuses.</small></label><label>Starts on<input name="startsOn" type="date" required onChange={(event) => updateDateRangeValidity(event.currentTarget.form!)} /></label><label>Ends on<input name="endsOn" type="date" required aria-invalid={dateRangeError ? true : undefined} aria-describedby={dateRangeError ? 'calendar-end-date-error' : undefined} onChange={(event) => updateDateRangeValidity(event.currentTarget.form!)} />{dateRangeError && <span id="calendar-end-date-error" className="admin-form-field__error" role="alert">{dateRangeError}</span>}</label>
    </form></Modal>
    <Modal open={showSync} title="Sync holidays" description="Import public holidays from a country calendar or a public iCal feed." onClose={() => { if (!syncing) setShowSync(false) }} size="large" footer={<><button className="button-secondary" type="button" disabled={syncing} onClick={() => setShowSync(false)}>Close</button><button className="button-primary" type="submit" form="holiday-sync-form" disabled={syncing}>{syncing && <span className="calendar-sync-spinner" aria-hidden="true" />}{syncing ? 'Syncing…' : syncTab === 'national' ? 'Fetch & Import' : 'Sync from URL'}</button></>}>
      <div className="calendar-sync">
        <div className="admin-tabs__list calendar-sync__tabs-responsive" role="tablist" aria-label="Holiday source" style={{ marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
          <button id="sync-tab-national" type="button" role="tab" className="admin-tab-btn" aria-selected={syncTab === 'national'} aria-controls="holiday-sync-form" style={{ flex: '1 1 auto', minWidth: '120px', textAlign: 'center' }} onClick={() => { setSyncTab('national'); setSyncError(''); setSyncResult('') }}>National holidays</button>
          <button id="sync-tab-ical" type="button" role="tab" className="admin-tab-btn" aria-selected={syncTab === 'ical'} aria-controls="holiday-sync-form" style={{ flex: '1 1 auto', minWidth: '120px', textAlign: 'center' }} onClick={() => { setSyncTab('ical'); setSyncError(''); setSyncResult('') }}>Google / iCal feed</button>
        </div>
        {syncError && <div className="inline-error" role="alert" style={{ marginBottom: '1rem' }}>{syncError}</div>}
        {syncResult && <div className="calendar-sync__success" role="status" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#ecfdf5', color: '#065f46', borderRadius: '0.5rem', border: '1px solid #a7f3d0', fontSize: '0.875rem' }}>{syncResult}</div>}
        <form id="holiday-sync-form" className="admin-form-grid" onSubmit={sync} aria-labelledby={syncTab === 'national' ? 'sync-tab-national' : 'sync-tab-ical'}>
          {syncTab === 'national' ? (
            <>
              <label>
                Country
                <select name="country" defaultValue="IN">
                  <option value="IN">India</option>
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AE">United Arab Emirates</option>
                  <option value="CA">Canada</option>
                  <option value="SG">Singapore</option>
                </select>
              </label>
              <label>
                Year
                <select name="year" defaultValue={currentYear}>
                  <option value={currentYear}>{currentYear}</option>
                  <option value={currentYear + 1}>{currentYear + 1}</option>
                  <option value={currentYear + 2}>{currentYear + 2}</option>
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                State or region (optional)
                <input name="subdivision" maxLength={16} placeholder="e.g. MH, DL, CA" />
              </label>
            </>
          ) : (
            <label style={{ gridColumn: 'span 2' }}>
              Public iCal URL
              <input name="icalUrl" type="url" required placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics" autoComplete="url" />
            </label>
          )}
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
          {syncTab === 'national' ? 'Includes observed public holidays; India also includes restricted holidays.' : 'Use a public HTTPS .ics feed. Recurring events are expanded for this year and the next two years.'}
        </p>
      </div>
    </Modal>
    <Card className="entity-table-card"><SectionHeader title={`Scheduled events (${queryLoaded ? data.count : 0})`} /><DataTable caption="Scheduled events" columns={columns} rows={queryLoaded ? data.items : []} getRowId={(item) => item.id} rowLabel={(item) => item.title} totalRows={queryLoaded ? data.count : 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} loading={!queryLoaded} error={queryLoaded && listError ? listError : undefined} onRetry={() => setRevision((value) => value + 1)} filters={<label className="search-control"><Search aria-hidden="true" /><span className="sr-only">Search calendar events</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search calendar events" /></label>} emptyTitle="No calendar events found" emptyDescription={search ? 'Try a different search.' : 'Add holidays, exams, PTMs, and institute events here.'} /></Card>
  </div>
}
