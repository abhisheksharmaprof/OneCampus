import { useEffect, useState } from 'react'
import { adminRequest } from '../../admin/admin.api'
import { getAttendanceSettings, getLeaveTypes, updateAttendanceSettings } from '../api/attendanceApi'
import type { AttendanceSettings, LeaveType } from '../types'

const CAPTURE_MODES = [
  { id: 'manual', label: 'Manual Tap' },
  { id: 'qr', label: 'QR Scan' },
  { id: 'rfid', label: 'RFID Card' },
  { id: 'biometric', label: 'Biometric Scanner' },
  { id: 'face', label: 'Face Recognition' },
]

export interface SettingsTabProps {
  accessToken: string
}

export function SettingsTab({ accessToken }: SettingsTabProps) {
  const [settings, setSettings] = useState<AttendanceSettings | null>(null)
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  
  // New Leave Type Form
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newApplicableTo, setNewApplicableTo] = useState<'student' | 'staff' | 'both'>('both')
  const [newMaxDays, setNewMaxDays] = useState(12)
  const [newReqDoc, setNewReqDoc] = useState(false)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getAttendanceSettings(accessToken, undefined, controller.signal),
      getLeaveTypes(accessToken, undefined, controller.signal),
    ])
      .then(([config, types]) => {
        setSettings(config)
        setLeaveTypes(types)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Attendance settings could not be loaded.')
        }
      })
    return () => controller.abort()
  }, [accessToken])

  const save = async () => {
    if (!settings) return
    if (!(settings.enabledCaptureModes?.length)) {
      setError('Enable at least one attendance capture mode before saving.')
      return
    }
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await updateAttendanceSettings(accessToken, settings)
      setSettings(updated)
      setMessage('Attendance settings saved successfully.')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const addLeaveType = async () => {
    if (!newName.trim() || !newCode.trim()) return
    setError('')
    try {
      await adminRequest(accessToken, 'attendance/leave-types', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          code: newCode.trim().toUpperCase(),
          applicableTo: newApplicableTo,
          maxDaysPerYear: Number(newMaxDays),
          requiresDocument: newReqDoc,
        }),
      })
      setLeaveTypes(await getLeaveTypes(accessToken))
      setNewName('')
      setNewCode('')
      setMessage('Leave type added successfully.')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Leave type could not be added.')
    }
  }

  const change = (patch: Partial<AttendanceSettings>) =>
    setSettings((current) => (current ? { ...current, ...patch } : current))

  const toggleCapture = (id: string) => {
    const currentModes = settings?.enabledCaptureModes ?? []
    if (currentModes.length === 1 && currentModes[0] === id) {
      setError('At least one attendance capture mode must remain enabled.')
      return
    }
    const updated = currentModes.includes(id)
      ? currentModes.filter((m) => m !== id)
      : [...currentModes, id]
    change({ enabledCaptureModes: updated })
  }

  return (
    <div className="settings-tab" data-testid="settings-tab">
      <div
        className="page-heading"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}
      >
        <div>
          <h2>Attendance & Leave Configuration</h2>
          <p className="page-subtitle">
            Manage capture modes, low-attendance thresholds & recipient rules, approval routing, and leave catalog.
          </p>
        </div>
        <button
          type="button"
          className="button-primary"
          disabled={saving || !settings}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {message && <div className="inline-success">{message}</div>}

      {settings && (
        <>
          {/* Capture Modes Toggle */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2>Capture Modes & Period Tracking</h2>
            <p style={{ marginBottom: '1rem' }}>Select active attendance recording methods for the institute:</p>
            <div
              className="settings-checks"
              data-testid="capture-modes-toggle"
              style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
            >
              {CAPTURE_MODES.map((mode) => (
                <label key={mode.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={(settings.enabledCaptureModes ?? []).includes(mode.id)}
                    onChange={() => toggleCapture(mode.id)}
                  />
                  {mode.label}
                </label>
              ))}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={settings.periodWiseEnabled ?? false}
                onChange={(e) => change({ periodWiseEnabled: e.target.checked })}
              />
              Enable period / subject-wise attendance tracking
            </label>
          </div>

          {/* Low-Attendance Threshold & Recipient Rules */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2>Low-Attendance Threshold & Alert Rules</h2>
            <div className="form-grid" style={{ marginBottom: '1rem' }}>
              <label>
                Low-attendance threshold (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  aria-label="Low-attendance threshold"
                  value={settings.lowAttendanceThreshold ?? 75}
                  onChange={(e) => change({ lowAttendanceThreshold: Number(e.target.value) })}
                />
              </label>
              <label>
                Consecutive absence threshold (days)
                <input
                  type="number"
                  min="1"
                  aria-label="Consecutive absence threshold"
                  value={settings.consecutiveAbsentThreshold ?? 3}
                  onChange={(e) => change({ consecutiveAbsentThreshold: Number(e.target.value) })}
                />
              </label>
            </div>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Alert Recipient Rules:</p>
            <div
              className="settings-checks"
              data-testid="recipient-rules"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}
            >
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={settings.enableParentNotifications ?? true}
                  onChange={(e) => change({ enableParentNotifications: e.target.checked })}
                />
                Notify parents on low attendance / absence
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={settings.notifyClassTeacher ?? false}
                  onChange={(e) => change({ notifyClassTeacher: e.target.checked })}
                />
                Notify class teacher
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={settings.notifyBranchAdmin ?? false}
                  onChange={(e) => change({ notifyBranchAdmin: e.target.checked })}
                />
                Notify branch admin
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={settings.parentAcknowledgementEnabled ?? false}
                  onChange={(e) => change({ parentAcknowledgementEnabled: e.target.checked })}
                />
                Allow parent acknowledgement / dispute
              </label>
            </div>
          </div>

          {/* Approval Routing Configuration */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2>Approval Routing Configuration</h2>
            <div className="form-grid">
              <label>
                Student leave approval routing
                <select
                  aria-label="Student leave routing"
                  value={settings.studentLeaveRouting ?? 'class_teacher'}
                  onChange={(e) =>
                    change({ studentLeaveRouting: e.target.value as AttendanceSettings['studentLeaveRouting'] })
                  }
                >
                  <option value="class_teacher">Class teacher only</option>
                  <option value="branch_admin">Branch admin only</option>
                  <option value="both">Class teacher + branch admin</option>
                </select>
              </label>
              <label>
                Staff leave approval routing
                <select
                  aria-label="Staff leave routing"
                  value={settings.staffLeaveRouting ?? 'branch_admin'}
                  onChange={(e) =>
                    change({ staffLeaveRouting: e.target.value as AttendanceSettings['staffLeaveRouting'] })
                  }
                >
                  <option value="branch_admin">Branch admin</option>
                  <option value="institute_admin">Institute admin</option>
                </select>
              </label>
            </div>
          </div>

          {/* Leave Types Catalog Management */}
          <div className="card">
            <h2>Leave Types Catalog Management</h2>
            <div className="form-grid" style={{ marginBottom: '1rem' }}>
              <label>
                Leave Type Name
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Medical Leave"
                  aria-label="Leave Type Name"
                />
              </label>
              <label>
                Code
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. MED"
                  aria-label="Leave Type Code"
                />
              </label>
              <label>
                Applies To
                <select
                  value={newApplicableTo}
                  onChange={(e) => setNewApplicableTo(e.target.value as 'student' | 'staff' | 'both')}
                >
                  <option value="both">Both Student & Staff</option>
                  <option value="student">Student Only</option>
                  <option value="staff">Staff Only</option>
                </select>
              </label>
              <label>
                Annual Quota (Days)
                <input
                  type="number"
                  min="0"
                  value={newMaxDays}
                  onChange={(e) => setNewMaxDays(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                <input
                  type="checkbox"
                  checked={newReqDoc}
                  onChange={(e) => setNewReqDoc(e.target.checked)}
                />
                Requires Document Attachment
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="button-secondary" onClick={() => void addLeaveType()}>
                  Add Leave Type
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table aria-label="Leave Types Catalog">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Applies To</th>
                    <th>Annual Quota</th>
                    <th>Document Required</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <br />
                        <small>{item.code}</small>
                      </td>
                      <td>{item.applicableTo}</td>
                      <td>{item.maxDaysPerYear || 'Unlimited'}</td>
                      <td>{item.requiresDocument ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                  {leaveTypes.length === 0 && (
                    <tr>
                      <td colSpan={4}>No leave types configured.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
