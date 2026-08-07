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
type RoomState = { occupied: boolean; label: 'Available' | 'In use' | 'Unavailable'; detail: string }

const roomTypes = ['Classroom', 'Lab', 'Library', 'Sports', 'Meeting', 'Music', 'Art']
const dayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const apiType = (type: string) => type.toUpperCase().replaceAll(' ', '_')
const labelType = (type: string) => type.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const empty = (): PageData<Room> => ({ count: 0, page: 1, pageSize: 100, totalPages: 1, next: null, previous: null, items: [] })
const clockMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return (hours || 0) * 60 + (minutes || 0) }

export function RoomsFacilitiesPage({ accessToken, branches, selectedBranch }: { accessToken: string; branches: Branch[]; selectedBranch: string }) {
  const [data, setData] = useState<PageData<Room>>(empty)
  const [timetable, setTimetable] = useState<TimetableBundle | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [type, setType] = useState('All')
  const [editing, setEditing] = useState<Room | null | undefined>(undefined)
  const [schedule, setSchedule] = useState<Room | null>(null)
  const [utilization, setUtilization] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [typeChoice, setTypeChoice] = useState('')

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer) }, [])

  useEffect(() => {
    const controller = new AbortController()
    const roomQuery = new URLSearchParams({ page: '1', pageSize: '100' })
    const timetableQuery = new URLSearchParams({ page: '1', pageSize: '100', order: '-updatedAt' })
    if (selectedBranch !== 'all') { roomQuery.set('branchId', selectedBranch); timetableQuery.set('branchId', selectedBranch) }
    void Promise.all([
      adminRequest<PageData<Room>>(accessToken, `academics/rooms?${roomQuery}`, { signal: controller.signal }),
      adminRequest<{ data: { data?: { bundle?: TimetableBundle } } | null }>(accessToken, `timetable/published?${timetableQuery}`, { signal: controller.signal }).catch(() => ({ data: null })),
    ]).then(([roomsResult, timetableResult]) => {
      setData(roomsResult)
      const bundle = timetableResult?.data?.data?.bundle
      setTimetable(bundle ?? null)
      setError('')
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Rooms could not be loaded.') })
    return () => controller.abort()
  }, [accessToken, selectedBranch, revision])

  const rooms = useMemo(() => type === 'All' ? data.items : data.items.filter((room) => labelType(room.roomType) === type), [data.items, type])
  const types = useMemo(() => [...new Set(data.items.map((room) => labelType(room.roomType)))], [data.items])
  const minuteOfDay = now.getHours() * 60 + now.getMinutes()
  const currentDay = dayCodes[now.getDay()]
  const currentPeriod = timetable?.config?.periods?.find((period) => period.type !== 'break' && clockMinutes(period.start) <= minuteOfDay && clockMinutes(period.end) > minuteOfDay)
  const entries = timetable?.lastResult?.entries ?? []
  const roomState = (room: Room): RoomState => {
    const entry = currentPeriod ? entries.find((item) => item.roomId === room.id && item.day.toUpperCase() === currentDay && item.periods.includes(currentPeriod.number)) : undefined
    const className = timetable?.classes?.find((item) => item.id === entry?.classId)?.name
    const subjectName = timetable?.subjects?.find((item) => item.id === entry?.subjectId)?.name
    // Timetable occupancy is the source of truth for the live card status.
    // `isActive` controls whether the room can be selected while building a
    // timetable, but it must not make an otherwise free room look occupied.
    return { occupied: Boolean(entry), label: entry ? 'In use' : 'Available', detail: entry ? `${className ?? 'Scheduled class'}${subjectName ? ` — ${subjectName}` : ''}` : 'Free for scheduling' }
  }
  const states = new Map(data.items.map((room) => [room.id, roomState(room)]))
  const availableCount = data.items.filter((room) => states.get(room.id)?.label === 'Available').length
  const inUseCount = data.items.filter((room) => states.get(room.id)?.label === 'In use').length

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

  const toggle = async (room: Room) => { try { await adminRequest(accessToken, `academics/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !room.isActive }) }); setRevision((value) => value + 1) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Room status could not be updated.') } }
  const formType = typeChoice || labelType(editing?.roomType ?? 'CLASSROOM')
  const campusDefault = editing?.branch.id ?? (selectedBranch === 'all' ? branches[0]?.id ?? '' : selectedBranch)

  return <main className="entity-page rooms-page">
    <div className="institute-subpage-heading"><p className="breadcrumb">Home　›　Institute Setup　›　Rooms &amp; Facilities</p><h1>Rooms &amp; Facilities</h1><p className="page-subtitle">Physical spaces — used for timetable scheduling and conflict detection.</p></div>
    <div className="rooms-actions"><button className="button-secondary" type="button" onClick={() => setUtilization(true)}><BarChart3 size={16} /> Utilization</button><button className="button-primary" type="button" onClick={() => { setTypeChoice(''); setEditing(null) }}><Plus size={16} /> Add Room</button></div>
    {error ? <div className="inline-error" role="alert">{error}</div> : null}
    <div className="rooms-kpis"><Metric label="Total Rooms" value={data.items.length} icon={<DoorOpen />} /><Metric label="In Use" value={inUseCount} hint="From timetable" icon={<Check />} /><Metric label="Available" value={availableCount} hint="Free right now" icon={<Check />} /><Metric label="Room Types" value={types.length} hint="Different categories" icon={<DoorOpen />} /></div>
    <div className="room-filter-tabs"><button className={type === 'All' ? 'active' : ''} type="button" onClick={() => setType('All')}>All ({data.items.length})</button>{types.map((item) => <button className={type === item ? 'active' : ''} key={item} type="button" onClick={() => setType(item)}>{item} ({data.items.filter((room) => labelType(room.roomType) === item).length})</button>)}</div>
    <div className="rooms-grid">{rooms.map((room) => { const state = states.get(room.id) ?? roomState(room); return <article className={`room-card ${state.label === 'In use' ? 'occupied' : state.label === 'Available' ? 'available' : 'unavailable'}`} key={room.id}>
      <header><div><strong>{room.name}</strong><small>Floor {room.floor} • Capacity: {room.capacity ?? '—'}</small></div><aside><span className={`room-type ${labelType(room.roomType).toLowerCase()}`}>{labelType(room.roomType)}</span><span className={`room-status room-status--${state.label.toLowerCase().replace(' ', '-')}`}>{state.label}</span></aside></header>
      {room.equipment.length ? <div className="equipment">{room.equipment.map((item) => <span key={item}>{item}</span>)}</div> : null}
      <div className="room-period"><span>{currentPeriod ? `Current period · P${currentPeriod.number}` : 'Current status'}</span><b>{state.detail}</b><span>Timetable sync</span><em>{timetable ? 'Automatically updated' : 'No published timetable'}</em></div>
      <footer><button className="button-secondary btn-sm" type="button" onClick={() => setSchedule(room)}><CalendarDays size={15} /> Schedule</button><button className="button-secondary btn-sm" type="button" onClick={() => { setTypeChoice(roomTypes.includes(labelType(room.roomType)) ? labelType(room.roomType) : 'Other'); setEditing(room) }}><Pencil size={15} /> Edit</button><button className="button-secondary btn-sm icon-only" type="button" onClick={() => toggle(room)} aria-label={`Mark ${room.name} ${room.isActive ? 'unavailable' : 'available'}`}>{room.isActive ? <X size={15} /> : <Check size={15} />}</button></footer>
    </article> })}</div>
    <Modal open={editing !== undefined} title={editing ? `Edit Room — ${editing.name}` : 'Add Room'} description="Create or update a physical space." onClose={() => !saving && setEditing(undefined)} footer={<><button className="button-secondary" type="button" onClick={() => setEditing(undefined)}>Cancel</button><button className="button-primary" form="room-form" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}><form id="room-form" className="room-form" onSubmit={save}><label>Room Name *<input name="name" defaultValue={editing?.name} placeholder="e.g., Room 301" required /></label><label>Type<select name="roomType" value={formType} onChange={(event) => setTypeChoice(event.target.value)}>{roomTypes.map((item) => <option key={item}>{item}</option>)}<option>Other</option></select>{branches.length === 0 ? <small className="field-help">Create a campus before adding a room.</small> : null}</label>{formType === 'Other' ? <label className="wide">Custom Type *<input name="customRoomType" defaultValue={editing ? labelType(editing.roomType) : ''} placeholder="e.g., Auditorium" required /></label> : null}<label>Capacity<input name="capacity" type="number" min="1" defaultValue={editing?.capacity ?? 40} /></label><label>Floor<input name="floor" type="number" min="0" defaultValue={editing?.floor ?? 1} /></label><label className="wide">Equipment (comma-separated)<input name="equipment" defaultValue={editing?.equipment?.join(', ') ?? 'Projector, Whiteboard, Fans'} /></label><label className="wide">Campus<select name="branchId" key={`${editing?.id ?? 'new'}-${branches.length}`} defaultValue={campusDefault} required={branches.length > 0} disabled={branches.length === 0}><option value="" disabled>{branches.length ? 'Select campus' : 'No campuses available'}</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label className="wide checkbox-label"><input name="isActive" type="checkbox" defaultChecked={editing?.isActive ?? true} /> Available for scheduling</label></form></Modal>
    <Modal open={Boolean(schedule)} title={`Schedule — ${schedule?.name ?? ''}`} description="Room timetable" onClose={() => setSchedule(null)}><p className="room-modal-copy">Schedule data will appear here once timetable room allocations are configured.</p></Modal>
    <Modal open={utilization} title="Room Utilization Report" description="Current availability based on the published timetable." onClose={() => setUtilization(false)}><div className="utilization-list">{data.items.map((room) => { const state = states.get(room.id) ?? roomState(room); return <p key={room.id}><b>{room.name}</b><span>{room.capacity ?? '—'} seats</span><em>{state.label}</em></p> })}</div></Modal>
  </main>
}

function Metric({ label, value, hint, icon }: { label: string; value: number; hint?: string; icon: ReactNode }) { return <div><span>{label}</span><i>{icon}</i><strong>{value}</strong>{hint ? <small>▲ {hint}</small> : null}</div> }
