import { BoneScreen, DataTable, DashboardSkeleton, PageSkeleton } from '../../components/admin-ui'

function Fixture({ className = 'capture-fixture' }: { className?: string }) {
  return <div className={className} style={{ display: 'grid', gap: '0.75rem', minHeight: '8rem' }}>{[0, 1, 2, 3].map((item) => <span key={item} style={{ display: 'block', height: item === 0 ? '2rem' : '1rem', width: `${92 - item * 14}%`, borderRadius: '0.4rem', background: '#e8edf3' }} />)}</div>
}

function CaptureTable({ caption }: { caption: string }) {
  const rows: Array<{ id: string; name: string }> = []
  const columns = [{ id: 'name', header: 'Name', cell: () => null }, { id: 'status', header: 'Status', cell: () => null }]
  return <DataTable caption={caption} columns={columns} rows={rows} getRowId={(row) => row.id} rowLabel={(row) => row.name} totalRows={0} page={1} pageSize={25} onPageChange={() => undefined} onPageSizeChange={() => undefined} loading />
}

/** Dev-only capture surface used by `npm run build:bones`. */
export function BoneyardCapturePage() {
  return (
    <main aria-label="Boneyard skeleton capture" style={{ display: 'grid', gap: '2rem', padding: '2rem' }}>
      <DashboardSkeleton />
      <PageSkeleton name="branch-detail" label="Loading branch details" variant="detail" />
      <PageSkeleton name="admissions-funnel" label="Loading admissions funnel" variant="form" />
      <PageSkeleton name="operational-list" label="Loading operational screen" variant="list" />
      <PageSkeleton name="profile-detail" label="Loading profile" variant="detail" />
      <PageSkeleton name="institute-profile" label="Loading institute profile" variant="form" />
      <PageSkeleton name="parents-directory" label="Loading parent directory" variant="list" />
      <PageSkeleton name="timetable-route" label="Loading timetable" variant="form" />
      <PageSkeleton name="operational-record-detail" label="Loading record details" variant="detail" />
      <PageSkeleton name="timetable-saved-list" label="Loading saved timetables" variant="list" />
      <BoneScreen name="fee-structure-page" loading label="Loading fee structure"><Fixture /></BoneScreen>
      {['People', 'Staff members', 'Students', 'Roles', 'Role assignments', 'Enquiries', 'Scheduled events', 'Fee invoices'].map((caption) => <CaptureTable key={caption} caption={caption} />)}
      <BoneScreen name="academics-operations" loading label="Loading academic data"><Fixture /></BoneScreen>
      <BoneScreen name="academic-structure-subjects" loading label="Loading subjects and curriculum"><Fixture /></BoneScreen>
      <BoneScreen name="attendance-mark-roster" loading label="Loading attendance roster"><Fixture /></BoneScreen>
      <BoneScreen name="attendance-overview-charts" loading label="Loading attendance charts"><Fixture /></BoneScreen>
      <BoneScreen name="attendance-overview-calendar" loading label="Loading overview register"><Fixture /></BoneScreen>
      <BoneScreen name="attendance-reports-analytics" loading label="Loading attendance analytics"><Fixture /></BoneScreen>
      <BoneScreen name="attendance-leave-approvals" loading label="Loading leave approvals"><Fixture /></BoneScreen>
      <BoneScreen name="timetable-teachers" loading label="Loading teachers timetable"><Fixture /></BoneScreen>
      <BoneScreen name="timetable-structure" loading label="Loading structure timetable"><Fixture /></BoneScreen>
      <BoneScreen name="timetable-assignments" loading label="Loading assignments timetable"><Fixture /></BoneScreen>
      <BoneScreen name="timetable-import" loading label="Loading timetable import"><Fixture /></BoneScreen>
      <BoneScreen name="timetable-timetable" loading label="Loading timetable"><Fixture /></BoneScreen>
      <BoneScreen name="timetable-saved-view" loading label="Loading saved timetable"><Fixture /></BoneScreen>
    </main>
  )
}
