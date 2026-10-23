import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Check, DoorOpen, Pencil, Plus, X } from 'lucide-react'
import { Modal } from '../../components/admin-ui'
import { adminRequest, type PageData } from '../admin/admin.api'
import './rooms-facilities.css'

type Branch = { id: string; name: string }
type Room = { id: string; name: string; roomType: string; capacity: number | null; floor: number; equipment: string[]; isActive: boolean; branch: Branch }
type TimetablePeriod = { number: number; type?: string; start: string; end: string }
type TimetableEntry = { day: string; periods: number[]; roomId?: string | null; classId?: string; subjectId?: string }
type TimetableBundle = { config?: { periods?: TimetablePeriod[] }; classes?: Array<{ id: string; name: string }>; subjects?: Array<{ id: string; name: string }>; lastResult?: { entries?: TimetableEntry[] } | null }
type RoomState = { label: 'Scheduled in use' | 'No allocation now' | 'No active period' | 'Unknown'; detail: string }

const roomTypes = ['Classroom', 'Lab', 'Library', 'Sports', 'Meeting', 'Music', 'Art']
const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const apiType = (type: string) => type.toUpperCase().replaceAll(' ', '_')
const labelType = (type: string) => type.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const empty = (): PageData<Room> => ({ count: 0, page: 1, pageSize: 100, totalPages: 1, next: null, previous: null, items: [] })
const clockMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return (hours || 0) * 60 + (minutes || 0) }

export function RoomsFacilitiesPage({ accessToken, branches, selectedBranch }: { accessToken: string; branches: Branch[]; selectedBranch: string }) {
  const [data, setData] = useState<PageData<Room>>(empty)
  const [timetable, setTimetable] = useState<TimetableBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [type, setType] = useState('All')
  const [editing, setEditing] = useState<Room | null | undefined>(undefined)
  const [schedule, setSchedule] = useState<Room | null>(null)
  const [utilization, setUtilization] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [timetableError, setTimetableError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [typeChoice, setTypeChoice] = useState('')

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer) }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    const roomQuery = new URLSearchParams({ page: '1', pageSize: '100' })
    const timetableQuery = new URLSearchParams({ page: '1', pageSize: '100', order: '-updatedAt' })
    if (selectedBranch !== 'all') { roomQuery.set('branchId', selectedBranch); timetableQuery.set('branchId', selectedBranch) }
    const timetableRequest = adminRequest<{ data: { data?: { bundle?: TimetableBundle } } | null }>(accessToken, `timetable/published?${timetableQuery}`, { signal: controller.signal })
      .then((result) => ({ result, error: '' }))
      .catch((cause: unknown) => ({ result: null, error: cause instanceof Error ? cause.message : 'Published timetable could not be loaded.' }))
    void Promise.all([
      adminRequest<PageData<Room>>(accessToken, `academics/rooms?${roomQuery}`, { signal: controller.signal }),
      timetableRequest,
    ]).then(([roomsResult, timetableResult]) => {
      if (controller.signal.aborted) return
      setData(roomsResult)
      const bundle = timetableResult.result?.data?.data?.bundle
      setTimetable(bundle ?? null)
      setTimetableError(timetableResult.error)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Rooms could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, selectedBranch, revision])

  const rooms = useMemo(() => type === 'All' ? data.items : data.items.filter((room) => labelType(room.roomType) === type), [data.items, type])
  const types = useMemo(() => [...new Set(data.items.map((room) => labelType(room.roomType)))], [data.items])
  const minuteOfDay = now.getHours() * 60 + now.getMinutes()
  const currentDay = dayCodes[now.getDay()]
  const currentPeriod = timetable?.config?.periods?.find((period) => period.type !== 'break' && clockMinutes(period.start) <= minuteOfDay && clockMinutes(period.end) > minuteOfDay)
  const entries = timetable?.lastResult?.entries ?? []
  const roomState = (room: Room): RoomState => {
    if (!timetable) return { label: 'Unknown', detail: timetableError ? 'Occupancy data could not be loaded.' : 'No published timetable.' }
    if (!Array.isArray(timetable.lastResult?.entries)) return { label: 'Unknown', detail: 'No generated room allocation data.' }
    if (!currentPeriod) return { label: 'No active period', detail: 'There is no active timetable period right now.' }
    const entry = entries.find((item) => item.roomId === room.id && item.day.toUpperCase() === currentDay && item.periods.includes(currentPeriod.number))
    const className = timetable?.classes?.find((item) => item.id === entry?.classId)?.name
    const subjectName = timetable?.subjects?.find((item) => item.id === entry?.subjectId)?.name
    return entry
      ? { label: 'Scheduled in use', detail: `${className ?? 'Scheduled class'}${subjectName ? ` — ${subjectName}` : ''}` }
      : { label: 'No allocation now', detail: 'No room allocation in the current period.' }
  }
  const states = new Map(data.items.map((room) => [room.id, roomState(room)]))
  const occupancyKnown = Boolean(timetable && Array.isArray(timetable.lastResult?.entries) && currentPeriod)
  const inUseCount = data.items.filter((room) => states.get(room.id)?.label === 'Scheduled in use').length
  const schedulingAvailableCount = data.items.filter((room) => room.isActive).length

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!branches.length) { setError('Create a campus before adding a room.'); return }
    setSaving(true); setError('')
    const form = new FormData(event.currentTarget)
    const selectedType = String(form.get('roomType'))
    const customType = String(form.get('customRoomType') ?? '').trim()
    if (selectedType === 'Other' && !customType) { setError('Enter a custom room type.'); setSaving(false); return }
    const body = { name: String(form.get('name')).trim(), branchId: String(form.get('branchId')), roomType: apiType(selectedType === 'Other' ? customType : selectedType), capacity: Number(form.get('capacity')) || null, floor: Number(form.get('floor')) || 0, equipment: String(form.get('equipment')).split(',').map((item) => item.trim()).filter(Boolean), isActive: form.get('isActive') === 'on' }
    try { await adminRequest<Room>(accessToken, editing ? `academics/rooms/${editing.id}` : 'academics/rooms', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) }); setEditing(undefined); setRevision((value) => value + 1) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Room could not be saved.') } finally { setSaving(false) }
  }

  const toggle = async (room: Room) => { setError(''); try { await adminRequest(accessToken, `academics/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !room.isActive }) }); setRevision((value) => value + 1) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Room status could not be updated.') } }
  const formType = typeChoice || labelType(editing?.roomType ?? 'CLASSROOM')
  const campusDefault = editing?.branch.id ?? (selectedBranch === 'all' ? branches[0]?.id ?? '' : selectedBranch)

  return <main className="entity-page institute-setup-page rooms-page">
    <header className="institute-subpage-heading rooms-page__header">
      <div className="rooms-page__intro"><p className="breadcrumb">Home　›　Institute Setup　›　Rooms &amp; Facilities</p><h1>Rooms &amp; Facilities</h1><p className="page-subtitle">Track timetable occupancy separately from whether a room is enabled for scheduling.</p></div>
      <div className="rooms-actions"><button className="button-secondary" type="button" disabled={loading || Boolean(loadError)} onClick={() => setUtilization(true)}><BarChart3 size={16} /> Utilization</button><button className="button-primary" type="button" onClick={() => { setTypeChoice(''); setEditing(null) }}><Plus size={16} /> Add Room</button></div>
    </header>
    {error ? <div className="inline-error" role="alert">{error}</div> : null}
    {loadError ? <div className="rooms-state rooms-state--error" role="alert"><strong>Rooms could not be loaded</strong><p>{loadError}</p><button className="button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></div>
      : loading ? <div className="rooms-state" role="status" aria-live="polite"><span className="rooms-spinner" aria-hidden="true" />Loading rooms and timetable status…</div>
        : <>
          {timetableError ? <div className="rooms-notice rooms-notice--error" role="status"><strong>Occupancy data unavailable.</strong> {timetableError} Scheduling availability still reflects each room’s saved setting.</div>
            : !timetable ? <div className="rooms-notice" role="status"><strong>No published timetable.</strong> Room occupancy is unknown until a timetable is published. Scheduling availability is shown separately.</div>
              : !Array.isArray(timetable.lastResult?.entries) ? <div className="rooms-notice" role="status"><strong>No room allocation data.</strong> A published timetable has no generated room assignments to show.</div>
              : !currentPeriod ? <div className="rooms-notice" role="status"><strong>No active timetable period.</strong> Occupancy is not calculated outside a published period.</div> : null}
          <div className="rooms-kpis"><Metric label="Total Rooms" value={data.items.length} icon={<DoorOpen />} /><Metric label="Scheduled in use" value={occupancyKnown ? inUseCount : '—'} hint={occupancyKnown ? 'Current period' : timetableError ? 'Timetable unavailable' : timetable ? 'No active period' : 'No published timetable'} icon={<Check />} /><Metric label="Available for scheduling" value={schedulingAvailableCount} hint="Rooms enabled for timetables" icon={<Check />} /><Metric label="Room Types" value={types.length} hint="Different categories" icon={<DoorOpen />} /></div>
          <div className="room-filter-bar">
            <span className="room-filter-heading">Filter by room type</span>
            <div className="room-filter-tabs" role="group" aria-label="Filter rooms by type"><button className={type === 'All' ? 'active' : ''} type="button" aria-pressed={type === 'All'} onClick={() => setType('All')}>All ({data.items.length})</button>{types.map((item) => <button className={type === item ? 'active' : ''} key={item} type="button" aria-pressed={type === item} onClick={() => setType(item)}>{item} ({data.items.filter((room) => labelType(room.roomType) === item).length})</button>)}</div>
          </div>
          {data.items.length === 0 ? <div className="rooms-state rooms-state--empty"><DoorOpen size={22} aria-hidden="true" /><strong>No rooms yet</strong><p>Add the first room for this campus to make it available to timetable planning.</p><button className="button-primary" type="button" onClick={() => { setTypeChoice(''); setEditing(null) }}><Plus size={16} /> Add Room</button></div>
            : rooms.length === 0 ? <div className="rooms-state rooms-state--empty"><strong>No {type.toLowerCase()} rooms</strong><p>Choose another room type to see matching spaces.</p></div>
              : <div className="rooms-grid">{rooms.map((room) => { const state = states.get(room.id) ?? roomState(room); const occupied = state.label === 'Scheduled in use'; const occupancyTone = occupied ? 'occupied' : state.label === 'No allocation now' ? 'unoccupied' : 'unknown'; return <article className={`room-card ${occupied ? 'occupied' : state.label === 'No allocation now' ? 'available' : 'unknown'}`} key={room.id}>
                <header><div className="room-card__identity"><strong>{room.name}</strong><small>Floor {room.floor} · Capacity: {room.capacity ?? 'Not set'}</small></div><aside><span className={`room-type room-type--${labelType(room.roomType).toLowerCase().replaceAll(' ', '-')}`}>{labelType(room.roomType)}</span><span className={`room-status room-status--${occupancyTone}`}>{state.label}</span></aside></header>
                <div className="room-card__availability"><span>Scheduling availability</span><strong className={room.isActive ? 'is-enabled' : 'is-disabled'}>{room.isActive ? 'Available for scheduling' : 'Not available for scheduling'}</strong></div>
                {room.equipment.length ? <div className="equipment" aria-label="Equipment">{room.equipment.map((item) => <span key={item}>{item}</span>)}</div> : null}
                <div className="room-period"><span>{currentPeriod ? `Timetable · P${currentPeriod.number}` : 'Timetable occupancy'}</span><b>{state.detail}</b><span>Occupancy source</span><em>{timetableError ? 'Timetable could not be loaded' : timetable ? 'Published timetable' : 'No published timetable'}</em></div>
                <footer><button className="button-secondary btn-sm" type="button" onClick={() => setSchedule(room)}><CalendarDays size={15} /> Schedule</button><button className="button-secondary btn-sm" type="button" onClick={() => { setTypeChoice(roomTypes.includes(labelType(room.roomType)) ? labelType(room.roomType) : 'Other'); setEditing(room) }}><Pencil size={15} /> Edit</button><button className="button-secondary btn-sm icon-only" type="button" onClick={() => toggle(room)} aria-label={`${room.isActive ? 'Disable' : 'Enable'} ${room.name} for scheduling`}>{room.isActive ? <X size={15} /> : <Check size={15} />}</button></footer>
              </article> })}</div>}
        </>}
    <Modal open={editing !== undefined} title={editing ? `Edit Room — ${editing.name}` : 'Add Room'} description="Create or update a physical space." onClose={() => !saving && setEditing(undefined)} footer={<><button className="button-secondary" type="button" onClick={() => setEditing(undefined)}>Cancel</button><button className="button-primary" form="room-form" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}><form id="room-form" className="room-form" onSubmit={save}><label>Room Name *<input name="name" defaultValue={editing?.name} placeholder="e.g., Room 301" required /></label><label>Type<select name="roomType" value={formType} onChange={(event) => setTypeChoice(event.target.value)}>{roomTypes.map((item) => <option key={item}>{item}</option>)}<option>Other</option></select>{branches.length === 0 ? <small className="field-help">Create a campus before adding a room.</small> : null}</label>{formType === 'Other' ? <label className="wide">Custom Type *<input name="customRoomType" defaultValue={editing ? labelType(editing.roomType) : ''} placeholder="e.g., Auditorium" required /></label> : null}<label>Capacity<input name="capacity" type="number" min="1" defaultValue={editing?.capacity ?? 40} /></label><label>Floor<input name="floor" type="number" min="0" defaultValue={editing?.floor ?? 1} /></label><label className="wide">Equipment (comma-separated)<input name="equipment" defaultValue={editing?.equipment?.join(', ') ?? 'Projector, Whiteboard, Fans'} /></label><label className="wide">Campus<select name="branchId" key={`${editing?.id ?? 'new'}-${branches.length}`} defaultValue={campusDefault} required={branches.length > 0} disabled={branches.length === 0}><option value="" disabled>{branches.length ? 'Select campus' : 'No campuses available'}</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label className="wide checkbox-label"><input name="isActive" type="checkbox" defaultChecked={editing?.isActive ?? true} /> Available for scheduling</label></form></Modal>
    <Modal open={Boolean(schedule)} title={`Schedule — ${schedule?.name ?? ''}`} description="Room timetable" onClose={() => setSchedule(null)}><p className="room-modal-copy">Schedule data will appear here once timetable room allocations are configured.</p></Modal>
    <Modal open={utilization} title="Room Utilization Report" description="Timetable occupancy and scheduling availability for this campus." onClose={() => setUtilization(false)}>{data.items.length ? <div className="utilization-list">{data.items.map((room) => { const state = states.get(room.id) ?? roomState(room); return <div className="utilization-row" key={room.id}><strong>{room.name}</strong><span>{room.capacity ?? 'Not set'} seats</span><span>{state.label}</span><span className={room.isActive ? 'is-enabled' : 'is-disabled'}>{room.isActive ? 'Available for scheduling' : 'Not available for scheduling'}</span></div> })}</div> : <p className="room-modal-copy">No rooms are available for this report yet.</p>}</Modal>
  </main>
}

function Metric({ label, value, hint, icon }: { label: string; value: number | string; hint?: string; icon: ReactNode }) { return <div><span>{label}</span><span className="rooms-kpis__icon" aria-hidden="true">{icon}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div> }
