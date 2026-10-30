import type { CSSProperties } from 'react'

export const screenSkeletonCaptureNames = [
  'dashboard', 'branch-detail', 'admissions-funnel', 'operational-list', 'profile-detail',
  'institute-profile', 'parents-directory', 'timetable-route', 'operational-record-detail',
  'timetable-saved-list', 'fee-structure-page', 'table-people', 'table-staff-members',
  'table-students', 'table-roles', 'table-role-assignments', 'table-enquiries',
  'table-scheduled-events', 'table-fee-invoices', 'academics-operations',
  'academic-structure-subjects', 'attendance-mark-roster', 'attendance-overview-charts',
  'attendance-overview-calendar', 'attendance-reports-analytics', 'attendance-leave-approvals',
  'attendance-settings', 'timetable-teachers', 'timetable-structure', 'timetable-assignments',
  'timetable-import', 'timetable-timetable', 'timetable-saved-view', 'subscription',
  'rooms-facilities', 'finance-section', 'campus-list', 'platform-registration-queue',
  'staff-timetable',
  'student-profile', 'staff-profile', 'parent-profile', 'role-builder', 'audit-log-table',
] as const

const fullPageNames = new Set<string>([
  'dashboard', 'branch-detail', 'admissions-funnel', 'operational-list', 'profile-detail',
  'institute-profile', 'parents-directory', 'timetable-route', 'operational-record-detail',
  'timetable-saved-list', 'fee-structure-page', 'academics-operations', 'attendance-settings',
  'subscription', 'rooms-facilities', 'finance-section', 'campus-list',
  'platform-registration-queue', 'staff-timetable', 'student-profile', 'staff-profile',
  'parent-profile', 'role-builder',
])

export function isFullPageSkeleton(name: string) { return fullPageNames.has(name) }

const page: CSSProperties = { display: 'grid', gap: '1rem', width: '100%', maxWidth: '74rem', margin: '0 auto', padding: '1.25rem', color: '#25364a', font: '500 14px/1.45 Inter, system-ui, sans-serif', background: '#f5f7fa' }
const card: CSSProperties = { display: 'grid', gap: '.8rem', padding: '1rem', border: '1px solid #dce4ec', borderRadius: '12px', background: '#fff' }
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem' }
const muted: CSSProperties = { margin: 0, color: '#66788b' }
const input: CSSProperties = { minHeight: '2.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' }
const pill: CSSProperties = { display: 'inline-flex', padding: '.25rem .55rem', borderRadius: '999px', background: '#edf3f8', color: '#395570', fontSize: '12px' }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))', gap: '.75rem' }
const metric: CSSProperties = { ...card, gap: '.25rem', minHeight: '5rem' }
const table: CSSProperties = { display: 'grid', gap: '.6rem' }
const tableRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(8rem, 1.4fr) repeat(3, minmax(4rem, 1fr))', alignItems: 'center', gap: '.6rem', padding: '.7rem', borderBottom: '1px solid #e8edf2' }

function Header({ title, context = 'Workspace overview' }: { title: string; context?: string }) {
  return <header style={row}><div><small style={{ color: '#2463a5', fontWeight: 700 }}>{context}</small><h1 style={{ margin: '.15rem 0', fontSize: '1.55rem' }}>{title}</h1><p style={muted}>Review current records and make updates for this workspace.</p></div><span style={input} /></header>
}

function Metrics({ labels = ['In scope', 'Active', 'Needs review', 'Updated recently'] }: { labels?: string[] }) {
  return <div style={grid}>{labels.map((label, index) => <article style={metric} key={label}><small style={muted}>{label}</small><strong style={{ fontSize: '1.4rem' }}>{[128, 96, 12, 8][index % 4]}</strong><small style={muted}>{index === 2 ? 'Requires attention' : 'Current academic year'}</small></article>)}</div>
}

function Records({ headers = ['Name', 'Status', 'Updated', ''] }: { headers?: string[] }) {
  return <section style={{ ...card, padding: '.4rem 1rem' }}><div style={tableRow}>{headers.map((label, index) => <strong key={`${label}:${index}`} style={{ fontSize: '12px', color: '#5c6f82' }}>{label || 'Actions'}</strong>)}</div>{['Aarav Sharma', 'Grade 6 · Section A', 'Assessment record', 'Main Campus', 'Current term'].map((label, index) => <div style={tableRow} key={label}><strong>{label}</strong><span style={pill}>{index === 2 ? 'Needs review' : 'Active'}</span><span style={muted}>{['Today, 9:42 AM', 'Yesterday', 'Oct 28', 'Oct 26', 'Oct 24'][index]}</span><span style={{ ...input, minHeight: '2rem' }} /></div>)}</section>
}

function FixtureBody({ name }: { name: string }) {
  if (name === 'dashboard') return <><Metrics /><div style={grid}><section style={{ ...card, minHeight: '14rem' }}><h2>Attendance overview</h2><div style={{ ...grid, alignItems: 'end', minHeight: '9rem' }}>{[45, 76, 58, 92, 68, 84].map((height, index) => <i key={index} style={{ height: `${height}%`, minHeight: '2rem', borderRadius: '6px 6px 0 0', background: '#d9eafa' }} />)}</div></section><section style={{ ...card, minHeight: '14rem' }}><h2>Upcoming activity</h2><Records headers={['Activity', 'Owner', 'Date', 'Status']} /></section></div></>
  if (name.includes('attendance')) {
    if (name.includes('mark-roster')) return <div style={{ ...card, padding: '.5rem .75rem' }}>{Array.from({ length: 5 }, (_, index) => <div key={index} style={tableRow}><span style={{ ...input, width: '1rem', minHeight: '1rem' }} /><strong>Student name</strong><span style={input} /><span style={input} /></div>)}</div>
    if (name.includes('overview-calendar')) return <div style={{ ...card, padding: '.75rem' }}><span style={{ ...input, width: '40%' }} /><div style={{ ...grid, gridTemplateColumns: 'repeat(7, 1fr)' }}>{Array.from({ length: 35 }, (_, index) => <span key={index} style={{ ...input, minHeight: '2rem' }} />)}</div></div>
    if (name.includes('overview-charts') || name.includes('reports-analytics')) return <div style={{ ...grid, gridTemplateColumns: name.includes('reports') ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}><section style={{ ...card, minHeight: '13rem' }}><span style={{ ...input, width: '38%' }} /><div style={{ ...grid, alignItems: 'end', gridTemplateColumns: 'repeat(6, 1fr)', minHeight: '9rem' }}>{[52, 75, 65, 91, 71, 86].map((height, index) => <i key={index} style={{ height: `${height}%`, minHeight: '2rem', borderRadius: '5px 5px 0 0', background: '#d9eafa' }} />)}</div></section>{name.includes('reports') ? <section style={card}><span style={{ ...input, width: '32%' }} /><div style={{ ...grid, gridTemplateColumns: 'repeat(4, 1fr)' }}>{Array.from({ length: 8 }, (_, index) => <span key={index} style={{ ...input, minHeight: '2rem' }} />)}</div></section> : null}</div>
    if (name.includes('leave-approvals')) return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(4rem, 1fr))', gap: '.6rem', padding: '.6rem' }}>{Array.from({ length: 3 }, (_, index) => <span key={index} style={{ ...input, minHeight: '.9rem' }} />)}</div>
    return <><section style={card}><h2>Attendance settings</h2>{['Attendance window', 'Late arrival threshold', 'Notification rules', 'Approval workflow'].map((label) => <div style={row} key={label}><span>{label}</span><span style={input} /></div>)}</section></>
  }
  if (name.includes('timetable')) {
    if (name.includes('saved-list')) return <><section style={card}><div style={row}><h2>Saved timetables</h2><span style={input} /></div><Records headers={['Timetable', 'Campus', 'Academic year', 'Status']} /></section></>
    if (name.includes('saved-view')) return <><Metrics labels={['Classes', 'Teachers', 'Rooms', 'Unassigned periods']} /><Records headers={['Class / teacher', 'Monday', 'Tuesday', 'Wednesday']} /></>
    if (name.includes('teachers')) return <><div style={row}><span style={input} /><span style={input} /></div><Records headers={['Teacher', 'Monday', 'Tuesday', 'Wednesday']} /></>
    if (name.includes('structure')) return <><Metrics labels={['Classes', 'Subjects', 'Periods per day', 'Rooms']} /><Records headers={['Class', 'Section', 'Periods', 'Room']} /></>
    if (name.includes('assignments')) return <><Metrics labels={['Required assignments', 'Assigned', 'Unfilled', 'Teachers']} /><Records headers={['Class / subject', 'Teacher', 'Room', 'Periods']} /></>
    if (name.includes('import')) return <><section style={card}><h2>Import timetable</h2><p style={muted}>Choose a file, map its columns, and review the imported periods.</p><div style={{ ...input, minHeight: '8rem', display: 'grid', placeItems: 'center' }}>Drop timetable file here or browse</div></section><Records headers={['Class', 'Subject', 'Teacher', 'Time']} /></>
    return <><Metrics labels={['Classes', 'Periods', 'Teacher conflicts', 'Room conflicts']} /><Records headers={['Time', 'Monday', 'Tuesday', 'Wednesday']} /></>
  }
  if (name.includes('table-')) {
    const caption = name.replace(/^table-/, '').replaceAll('-', ' ')
    return <div style={{ ...card, gap: 0, padding: '.25rem .75rem' }}><div style={tableRow}>{caption.split(' ').map((word) => <strong key={word} style={{ fontSize: '12px', color: '#5c6f82' }}>{word[0]?.toUpperCase() + word.slice(1)}</strong>)}</div>{Array.from({ length: 5 }, (_, index) => <div style={tableRow} key={index}>{caption.split(' ').map((word) => <span key={word} style={{ ...input, minHeight: '.875rem' }} />)}</div>)}</div>
  }
  if (name.includes('profile') || name.includes('detail')) return <><section style={{ ...card, ...row, justifyContent: 'flex-start' }}><span style={{ ...input, width: '4rem', height: '4rem', borderRadius: '50%' }} /><div><h2>Aarav Sharma</h2><p style={muted}>Student · Grade 6 · Section A · Active</p><div style={row}><span style={pill}>Student ID STU-2048</span><span style={pill}>Main Campus</span></div></div></section><div style={grid}><section style={card}><h2>Personal information</h2><Records headers={['Field', 'Details']} /></section><section style={card}><h2>Academic overview</h2><Metrics labels={['Attendance', 'Subjects', 'Assessments']} /></section></div></>
  if (name.includes('admissions')) return <><Metrics labels={['New enquiries', 'Applications', 'In review', 'Admitted']} /><section style={card}><div style={row}><h2>Admissions funnel</h2><span style={input} /></div><div style={grid}>{['Enquiry', 'Application', 'Review', 'Decision'].map((label, index) => <article style={metric} key={label}><small>{label}</small><strong>{[86, 54, 28, 17][index]}</strong><span style={pill}>This term</span></article>)}</div></section><Records headers={['Applicant', 'Applying for', 'Stage', 'Updated']} /></>
  if (name.includes('institute') || name.includes('branch') || name.includes('campus')) return <><section style={{ ...card, ...row, justifyContent: 'flex-start' }}><span style={{ ...input, width: '3rem', height: '3rem' }} /><div><h2>{name.includes('campus') ? 'Campus sites' : 'Main Campus'}</h2><p style={muted}>Institution profile and campus details</p></div></section><section style={card}><h2>{name.includes('campus') ? 'Campus directory' : 'Institution details'}</h2><div style={grid}>{['Name', 'Code', 'Address', 'Contact', 'Academic year', 'Status'].map((label) => <label key={label}>{label}<div style={input} /></label>)}</div></section>{name.includes('campus') && <Records headers={['Campus', 'Code', 'Location', 'Status']} />}</>
  if (name.includes('parents')) return <><div style={row}><span style={input} /><span style={input} /><span style={input} /></div><Records headers={['Parent / guardian', 'Relationship', 'Children', 'Portal']} /></>
  if (name.includes('subscription')) return <><div style={grid}><article style={metric}><small>Current plan</small><strong>Campus Plus</strong><span style={pill}>Active</span></article><article style={metric}><small>Renewal date</small><strong>01 Aug 2027</strong></article></div><section style={card}><h2>Plan usage</h2><Records headers={['Resource', 'Used', 'Limit', 'Status']} /></section></>
  if (name.includes('rooms')) return <><Metrics labels={['Rooms', 'Available', 'In use', 'Needs review']} /><div style={row}><span style={input} /><span style={input} /></div><Records headers={['Room', 'Type', 'Capacity', 'Status']} /></>
  if (name.includes('finance') || name.includes('fee')) return <><Metrics labels={['Invoices', 'Collected', 'Outstanding', 'Overdue']} /><div style={row}><span style={input} /><span style={input} /></div><Records headers={['Fee / invoice', 'Due date', 'Amount', 'Status']} /></>
  if (name.includes('academic-structure') || name.includes('academics')) return <><div style={row}><span style={pill}>Overview</span><span style={pill}>Subjects</span><span style={pill}>Curriculum</span><span style={pill}>Teachers</span></div><Metrics labels={['Grade levels', 'Mapped subjects', 'Lab / practical', 'Weekly periods']} /><Records headers={['Subject', 'Code', 'Type', 'Periods / week']} /></>
  if (name.includes('platform-registration')) return <><Metrics labels={['New applications', 'Under review', 'Approved', 'Needs attention']} /><div style={row}><span style={input} /><span style={input} /></div><Records headers={['Institute', 'Submitted', 'Contact', 'Status']} /></>
  if (name.includes('role-builder')) return <><div style={row}><span style={pill}>1. Basics</span><span style={pill}>2. Permissions</span><span style={pill}>3. Review</span></div><section style={card}><h2>Role details</h2><div style={grid}>{['Role name', 'Branch', 'Description'].map((label) => <label key={label}>{label}<div style={input} /></label>)}</div></section><section style={card}><h2>Permission scope</h2>{['Dashboard', 'People', 'Academics', 'Attendance', 'Finance'].map((label) => <div style={row} key={label}><strong>{label}</strong><span style={pill}>View · Edit</span><span style={input} /></div>)}</section></>
  if (name === 'audit-log-table') return <div style={{ ...card, padding: '.4rem .7rem' }}><div style={{ ...tableRow, gridTemplateColumns: 'repeat(7, minmax(3rem, 1fr))' }}>{['When', 'Actor', 'Action', 'Message', 'Scope', 'Status', 'Details'].map((label) => <strong key={label} style={{ fontSize: '11px' }}>{label}</strong>)}</div>{Array.from({ length: 5 }, (_, index) => <div key={index} style={{ ...tableRow, gridTemplateColumns: 'repeat(7, minmax(3rem, 1fr))' }}>{['Oct 29, 9:42 AM', 'CampusOne Admin', 'student.update', 'Student profile was updated', 'Main Campus', 'Recorded', 'Details'].map((label) => <span key={label} style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>)}</div>)}</div>
  if (name.includes('operational')) return <><div style={row}><span style={input} /><span style={input} /><span style={input} /></div><Records headers={['Record', 'Category', 'Updated', 'Status']} /></>
  return <><Metrics /><div style={row}><span style={input} /><span style={input} /></div><Records /></>
}

export function ScreenSkeletonFixture({ name }: { name: string }) {
  const body = <FixtureBody name={name} />
  return isFullPageSkeleton(name)
    ? <main aria-hidden="true" data-screen-fixture={name} style={page}><Header title={name.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())} />{body}</main>
    : <div aria-hidden="true" data-screen-fixture={name}>{body}</div>
}
