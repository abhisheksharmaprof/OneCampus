import { useEffect, useState } from 'react'
import { approveLeaveApplication, getLeaveApplications, getLeaveHistory, rejectLeaveApplication } from '../api/attendanceApi'
import { BoneScreen } from '../../../components/admin-ui'
import type { LeaveApplication } from '../types'

export interface LeaveApprovalsTabProps {
  accessToken: string
  selectedBranch: string
  onLeaveApproved?: (studentId: string, startDate: string, endDate: string) => void
  initialType?: 'student' | 'staff'
  showTypeSwitcher?: boolean
}

export function LeaveApprovalsTab({
  accessToken,
  selectedBranch,
  onLeaveApproved,
  initialType = 'student',
  showTypeSwitcher = true,
}: LeaveApprovalsTabProps) {
  const [type, setType] = useState<'student' | 'staff'>(initialType)
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'date' | 'urgency'>('date')
  
  const [items, setItems] = useState<LeaveApplication[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  
  const [history, setHistory] = useState<Array<{ id: string; action: string; actorName?: string; note?: string; createdAt: string }> | null>(null)
  
  // Document preview modal state
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null)

  // Modal confirmation states for Approve and Reject
  const [actionConfirm, setActionConfirm] = useState<{
    type: 'approve' | 'reject'
    item: LeaveApplication
  } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionError, setRejectionError] = useState('')

  const load = () => {
    setError('')
    setLoading(true)
    void getLeaveApplications(accessToken, {
      applicantType: type,
      status: status || undefined,
      branchId: selectedBranch === 'all' ? undefined : selectedBranch,
      search,
    })
      .then((result) => {
        const sorted = [...result].sort((a, b) => {
          if (sort === 'urgency') {
            return Number(b.status === 'pending') - Number(a.status === 'pending') || b.totalDays - a.totalDays
          }
          return b.startDate.localeCompare(a.startDate)
        })
        setItems(sorted)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Leave applications could not be loaded.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [accessToken, selectedBranch, status, type, sort])
  useEffect(() => setType(initialType), [initialType])

  const handleOpenApproveModal = (item: LeaveApplication) => {
    setActionConfirm({ type: 'approve', item })
  }

  const handleOpenRejectModal = (item: LeaveApplication) => {
    setRejectionReason('')
    setRejectionError('')
    setActionConfirm({ type: 'reject', item })
  }

  const confirmApprove = async () => {
    if (!actionConfirm || actionConfirm.type !== 'approve') return
    const item = actionConfirm.item
    setBusy(item.id)
    setError('')
    setSuccess('')
    try {
      await approveLeaveApplication(accessToken, item.id)
      setSuccess(`Leave application for ${item.studentName ?? item.staffName ?? 'applicant'} approved.`)
      if (item.applicantType === 'student' && item.studentId) {
        onLeaveApproved?.(item.studentId, item.startDate, item.endDate)
      }
      setActionConfirm(null)
      load()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Approval failed.')
    } finally {
      setBusy('')
    }
  }

  const confirmReject = async () => {
    if (!actionConfirm || actionConfirm.type !== 'reject') return
    if (!rejectionReason.trim()) {
      setRejectionError('Rejection reason is mandatory.')
      return
    }

    const item = actionConfirm.item
    setBusy(item.id)
    setError('')
    setSuccess('')
    try {
      await rejectLeaveApplication(accessToken, item.id, rejectionReason.trim())
      setSuccess(`Leave application for ${item.studentName ?? item.staffName ?? 'applicant'} rejected.`)
      setActionConfirm(null)
      setRejectionReason('')
      setRejectionError('')
      load()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Rejection failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="leave-approvals-tab" data-testid="leave-approvals-tab">
      <div className="attendance-section-intro">
        <div>
          <span className="attendance-section-intro__tag">{type === 'student' ? 'Student workflow' : 'Staff workflow'}</span>
          <h2>{type === 'student' ? 'Student leave decisions' : 'Staff leave decisions'}</h2>
          <p>{type === 'student'
            ? 'Review requests with leave balance, supporting documents and a complete decision history. Administrators and assigned class teachers can approve student leave.'
            : 'Manage staff absence requests, balances and supporting documentation from a dedicated queue.'}</p>
        </div>
        <div className="attendance-approval-route">
          <strong>{type === 'student' ? 'Approval route' : 'Decision owner'}</strong>
          <span>{type === 'student' ? 'Admin or class teacher' : 'Institute / branch admin'}</span>
        </div>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {success && <div className="inline-success">{success}</div>}

      {showTypeSwitcher && <div className="segmented-control" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={type === 'student' ? 'active' : ''}
          onClick={() => setType('student')}
          data-testid="student-leave-toggle"
        >
          Student leave
        </button>
        <button
          type="button"
          className={type === 'staff' ? 'active' : ''}
          onClick={() => setType('staff')}
          data-testid="staff-leave-toggle"
        >
          Staff leave
        </button>
      </div>}

      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <label>
          Search applicant or reason
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load()
            }}
            placeholder="Search by name or reason"
            aria-label="Search applicant"
          />
        </label>
        <label>
          Status filter
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All statuses</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as 'date' | 'urgency')}>
            <option value="date">Newest date</option>
            <option value="urgency">Urgency / duration</option>
          </select>
        </label>
      </div>

      <div className="attendance-mini-metrics">
        <div><small>In this queue</small><strong>{loading ? '—' : items.length}</strong></div>
        <div><small>Pending review</small><strong>{loading ? '—' : items.filter((item) => item.status === 'pending').length}</strong></div>
        <div><small>Total leave days</small><strong>{loading ? '—' : items.reduce((sum, item) => sum + item.totalDays, 0)}</strong></div>
      </div>

      <div className="card attendance-table-card">
        <div className="table-wrap">
          <table aria-label="Leave Applications">
            <thead>
              <tr>
                <th>Applicant / Submitted by</th>
                <th>Leave Type / Balance</th>
                <th>Dates & Duration</th>
                <th>Document Attachment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.map((item) => {
                const applicantName = item.studentName ?? item.staffName ?? 'Unknown applicant'
                const hasBalance = item.balanceAllocated != null

                return (
                  <tr key={item.id} data-testid={`leave-row-${item.id}`}>
                    <td>
                      <strong>{applicantName}</strong>
                      <br />
                      <small>
                        {item.applicantType} · {item.appliedByName ?? item.appliedBy}
                      </small>
                    </td>
                    <td>
                      <strong>{item.leaveTypeName ?? item.leaveTypeId}</strong>
                      <br />
                      <small data-testid="leave-balance">
                        {hasBalance
                          ? `${item.balanceUsed}/${item.balanceAllocated} days used · ${item.balanceRemaining} remaining`
                          : 'No balance configured'}
                      </small>
                    </td>
                    <td>
                      {item.startDate} → {item.endDate}
                      <br />
                      <small>{item.totalDays} days</small>
                    </td>
                    <td>
                      {item.documentUrl ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <a href={item.documentUrl} target="_blank" rel="noreferrer">
                            Download
                          </a>
                          <button
                            type="button"
                            className="button-secondary"
                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.8rem' }}
                            onClick={() => setPreviewDocUrl(item.documentUrl!)}
                          >
                            Preview
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`status-pill status-${item.status}`}>{item.status}</span>
                      {item.rejectionReason && (
                        <div>
                          <small style={{ color: '#ef4444' }}>Reason: {item.rejectionReason}</small>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="form-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                        {item.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="button-primary"
                              disabled={busy === item.id}
                              onClick={() => handleOpenApproveModal(item)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={busy === item.id}
                              onClick={() => handleOpenRejectModal(item)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() =>
                            void getLeaveHistory(accessToken, item.id)
                              .then(setHistory)
                              .catch(() => setError('History could not be loaded.'))
                          }
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {loading && (
                <tr><td colSpan={6}><BoneScreen name="attendance-leave-approvals" loading label="Loading leave approvals"><div className="attendance-table-loader"><span /><span /><span /></div></BoneScreen></td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6}>No leave applications match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision History View */}
      {history && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Decision History</h2>
            <button type="button" className="button-secondary" onClick={() => setHistory(null)}>
              Close History
            </button>
          </div>
          {history.length === 0 ? (
            <p>No history recorded.</p>
          ) : (
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <strong>{h.action}</strong> by {h.actorName ?? 'system'} on {new Date(h.createdAt).toLocaleString()}
                  {h.note ? ` — ${h.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocUrl && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-modal--medium">
            <div className="admin-modal__header">
              <h2>Document Attachment Preview</h2>
              <button type="button" className="button-secondary" onClick={() => setPreviewDocUrl(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal__body" style={{ textAlign: 'center' }}>
              <p>Previewing document attachment:</p>
              <iframe
                src={previewDocUrl}
                title="Document Preview"
                style={{ width: '100%', height: '350px', border: '1px solid #ccc', marginTop: '0.5rem' }}
              />
              <div style={{ marginTop: '0.5rem' }}>
                <a href={previewDocUrl} target="_blank" rel="noreferrer" className="button-secondary">
                  Open in New Tab
                </a>
              </div>
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="button-secondary" onClick={() => setPreviewDocUrl(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog prior to Approval or Rejection */}
      {actionConfirm && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-modal--small">
            <div className="admin-modal__header">
              <h2>
                {actionConfirm.type === 'approve' ? 'Confirm Leave Approval' : 'Confirm Leave Rejection'}
              </h2>
              <button type="button" className="button-secondary" onClick={() => setActionConfirm(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal__body">
              <p className="admin-confirmation-copy">
                Are you sure you want to {actionConfirm.type} the leave application for{' '}
                <strong>
                  {actionConfirm.item.studentName ?? actionConfirm.item.staffName ?? 'applicant'}
                </strong>{' '}
                ({actionConfirm.item.totalDays} days: {actionConfirm.item.startDate} to {actionConfirm.item.endDate})?
              </p>

              {actionConfirm.type === 'reject' && (
                <div style={{ marginTop: '1rem' }}>
                  <label htmlFor="mandatory-rejection-reason" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>
                    Rejection Reason (Mandatory) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    id="mandatory-rejection-reason"
                    aria-label="Rejection Reason"
                    value={rejectionReason}
                    onChange={(e) => {
                      setRejectionReason(e.target.value)
                      if (e.target.value.trim()) setRejectionError('')
                    }}
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem' }}
                    placeholder="Provide a clear, detailed reason for rejecting this request."
                  />
                  {rejectionError && (
                    <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {rejectionError}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="button-secondary" onClick={() => setActionConfirm(null)}>
                Cancel
              </button>
              {actionConfirm.type === 'approve' ? (
                <button type="button" className="button-primary" onClick={() => void confirmApprove()}>
                  Approve Leave
                </button>
              ) : (
                <button type="button" className="button-danger admin-button--danger" onClick={() => void confirmReject()}>
                  Reject Leave
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
