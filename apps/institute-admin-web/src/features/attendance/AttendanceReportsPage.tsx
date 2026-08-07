import { ReportsAnalyticsTab } from './components/ReportsAnalyticsTab'

export function AttendanceReportsPage({ accessToken, selectedBranch }: { accessToken: string; selectedBranch: string }) {
  return (
    <div className="entity-page">
      <ReportsAnalyticsTab accessToken={accessToken} selectedBranch={selectedBranch} />
    </div>
  )
}
