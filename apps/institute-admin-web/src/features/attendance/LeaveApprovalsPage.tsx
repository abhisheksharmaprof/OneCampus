import { LeaveApprovalsTab } from './components/LeaveApprovalsTab'

export function LeaveApprovalsPage({ accessToken, selectedBranch }: { accessToken: string; selectedBranch: string }) {
  return (
    <div className="entity-page">
      <div className="page-heading">
        <div>
          <p className="breadcrumb">Attendance / Leave Approvals</p>
          <h1>Leave Approvals</h1>
          <p className="page-subtitle">Review student and staff leave applications for the selected branch.</p>
        </div>
      </div>
      <LeaveApprovalsTab accessToken={accessToken} selectedBranch={selectedBranch} />
    </div>
  )
}
