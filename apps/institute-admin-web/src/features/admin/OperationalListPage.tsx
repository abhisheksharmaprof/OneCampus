import { useEffect, useState, type FormEvent } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { ConfirmationDialog, FormField, Modal, PageSkeleton, useToast } from '../../components/admin-ui'
import type { AdminRoute } from '../../adminNavigation'
import { AdminApiError, adminRequest, type PageData } from './admin.api'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getScreenWorkflow, type GenericScreenId, type WorkflowField } from './screenWorkflows'
import { DedicatedOperationalLayouts } from './DedicatedOperationalLayouts'
import { AdmissionsAttendanceLayouts } from './AdmissionsAttendanceLayouts'
import { ReferenceOperationalLayouts } from './ReferenceOperationalLayouts'

type AdminRecord = {
  id: string
  title: string
  recordType: string
  status: string
  data?: Record<string, unknown>
  updatedAt?: string
  version: number
}

type ScreenData = {
  screen: { id: string; title: string; description?: string; primaryAction?: string; columns?: string[] }
  records: PageData<AdminRecord>
}

const getRecordTitle = (formData: Record<string, any>, fields: readonly WorkflowField[]): string => {
  const priorityKeys = ['name', 'title', 'formName', 'routeName', 'subject', 'staffMember', 'student', 'parentName', 'childName']
  for (const key of priorityKeys) {
    if (formData[key] !== undefined && formData[key] !== null && String(formData[key]).trim() !== '') {
      return String(formData[key])
    }
  }
  // Fallback to first field's value
  if (fields.length > 0) {
    const firstKey = fields[0].key
    if (formData[firstKey] !== undefined && formData[firstKey] !== null) {
      return String(formData[firstKey])
    }
  }
  return 'Unnamed Record'
}

const getRecordType = (formData: Record<string, any>, fields: readonly WorkflowField[]): string => {
  const priorityKeys = ['recordType', 'type', 'category', 'appointmentType', 'assignmentMode', 'approach', 'channel']
  for (const key of priorityKeys) {
    if (formData[key] !== undefined && formData[key] !== null) {
      return String(formData[key])
    }
  }
  return 'general'
}

export function OperationalListPage({ accessToken, route, selectedBranch }: {
  accessToken: string
  route: AdminRoute
  selectedBranch: string
}) {
  const navigate = useNavigate()
  let addToast: ((input: any) => string) | null = null
  try {
    const toast = useToast()
    addToast = toast.addToast
  } catch {
    // Ignore in tests where ToastProvider is not present
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const branchParam = searchParams.get('branch')
  const staffParam = searchParams.get('staff')
  const studentParam = searchParams.get('student')
  const enquiryParam = searchParams.get('enquiry')
  const idParam = searchParams.get('id')

  const selectedRecordId = staffParam || studentParam || enquiryParam || idParam

  const workflow = getScreenWorkflow(route.id as GenericScreenId)

  // Listing page states
  const [data, setData] = useState<ScreenData | null>(null)
  const [error, setError] = useState<AdminApiError | null>(null)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<AdminRecord | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Dynamic form states for Modal
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Detail page states
  const [detailRecord, setDetailRecord] = useState<AdminRecord | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [detailFormData, setDetailFormData] = useState<Record<string, any>>({})
  const [detailValidationErrors, setDetailValidationErrors] = useState<Record<string, string>>({})
  const [detailFormError, setDetailFormError] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)

  // Fetch listing data
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError(null)
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    if (search.trim()) params.set('search', search.trim())
    void adminRequest<ScreenData>(accessToken, `screens/${route.id}?${params}`, { signal: controller.signal })
      .then((response) => { setData(response); setError(null) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setData(null)
        setError(cause instanceof AdminApiError ? cause : new AdminApiError(`${route.label} could not be loaded.`))
      })
    return () => controller.abort()
  }, [accessToken, page, pageSize, revision, route.id, route.label, search, selectedBranch])

  // Fetch detail record if selected
  useEffect(() => {
    if (!selectedRecordId || !workflow.tabs || workflow.tabs.length === 0) {
      setDetailRecord(null)
      return
    }
    const controller = new AbortController()
    setLoadingDetail(true)
    setDetailError('')

    adminRequest<AdminRecord>(accessToken, `screens/${route.id}/records/${selectedRecordId}`, { signal: controller.signal })
      .then((record) => {
        setDetailRecord(record)
        setDetailError('')
        setLoadingDetail(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setDetailError(cause instanceof Error ? cause.message : 'Failed to load record.')
        setLoadingDetail(false)
      })

    return () => controller.abort()
  }, [accessToken, selectedRecordId, route.id, selectedBranch, revision, workflow.tabs])

  // Reset tab when selected record changes
  useEffect(() => {
    setActiveTab(0)
  }, [selectedRecordId])

  // Set detail form data when detail record loads
  useEffect(() => {
    if (detailRecord) {
      const initialData = { ...(detailRecord.data ?? {}) }
      for (const field of workflow.fields) {
        if (initialData[field.key] === undefined) {
          if (field.key === 'name' || field.key === 'title') {
            initialData[field.key] = detailRecord.title
          } else if (field.key === 'recordType' || field.key === 'type') {
            initialData[field.key] = detailRecord.recordType
          }
        }
      }
      setDetailFormData(initialData)
      setDetailValidationErrors({})
      setDetailFormError('')
    }
  }, [detailRecord, workflow.fields])

  const openCreate = () => {
    setSelectedRecord(null)
    setFormData({})
    setValidationErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  const openEdit = (record: AdminRecord) => {
    setSelectedRecord(record)
    const initialData = { ...(record.data ?? {}) }
    // Ensure standard keys are mapped if they are not in record.data
    for (const field of workflow.fields) {
      if (initialData[field.key] === undefined) {
        if (field.key === 'name' || field.key === 'title') {
          initialData[field.key] = record.title
        } else if (field.key === 'recordType' || field.key === 'type') {
          initialData[field.key] = record.recordType
        }
      }
    }
    setFormData(initialData)
    setValidationErrors({})
    setFormError('')
    setDialogOpen(true)
  }

  const openReferenceAction = (action: string, context?: Record<string, string>) => {
    if (action.startsWith('create-') || action.startsWith('new-') || action.startsWith('add-') || action === 'generate-report-cards' || action === 'publish-timetable') {
      openCreate()
      return
    }
    if (action.startsWith('delete-') || action === 'cancel-common-test') {
      setConfirmDelete(true)
      return
    }
    addToast?.({
      title: 'Action ready',
      message: `${action.replaceAll('-', ' ')}${context ? ` for ${Object.values(context).join(' · ')}` : ''}.`,
      tone: 'info',
    })
  }

  const navigateReference = (destination: string, context?: Record<string, string>) => {
    const query = new URLSearchParams(context)
    if (selectedBranch !== 'all' && !query.has('branch')) query.set('branch', selectedBranch)
    navigate(`${destination}${query.size ? `?${query.toString()}` : ''}`)
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    for (const field of workflow.fields) {
      const val = formData[field.key]
      if (field.required) {
        if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
          if (field.type !== 'boolean') {
            errors[field.key] = `${field.label} is required.`
          }
        }
      }
      if (val) {
        if (field.type === 'email' && typeof val === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(val)) {
            errors[field.key] = 'Please enter a valid email address.'
          }
        }
      }
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateDetailForm = (): boolean => {
    const errors: Record<string, string> = {}
    for (const field of workflow.fields) {
      const val = detailFormData[field.key]
      if (field.required) {
        if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
          if (field.type !== 'boolean') {
            errors[field.key] = `${field.label} is required.`
          }
        }
      }
      if (val) {
        if (field.type === 'email' && typeof val === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(val)) {
            errors[field.key] = 'Please enter a valid email address.'
          }
        }
      }
    }
    setDetailValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setValidationErrors((prev) => ({ ...prev, [key]: '' }))
    setFormError('')
  }

  const handleDetailFieldChange = (key: string, value: any) => {
    setDetailFormData((prev) => ({ ...prev, [key]: value }))
    setDetailValidationErrors((prev) => ({ ...prev, [key]: '' }))
    setDetailFormError('')
  }

  const saveRecord = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateForm()) {
      setFormError('Please fix the validation errors below.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const recordTitle = getRecordTitle(formData, workflow.fields)
      const recordType = getRecordType(formData, workflow.fields)

      await adminRequest<AdminRecord>(accessToken, selectedRecord ? `screens/${route.id}/records/${selectedRecord.id}` : `screens/${route.id}/records`, {
        method: selectedRecord ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: recordTitle,
          recordType: recordType,
          status: selectedRecord?.status ?? 'ACTIVE',
          branchId: selectedBranch === 'all' ? null : selectedBranch,
          data: formData,
          ...(selectedRecord ? { version: selectedRecord.version } : {})
        }),
      })

      if (addToast) {
        addToast({
          title: 'Success',
          message: selectedRecord ? 'Record updated successfully.' : 'Record created successfully.',
          tone: 'success'
        })
      }

      setDialogOpen(false)
      setFormData({})
      setRevision((value) => value + 1)
    } catch (cause) {
      const apiError = cause instanceof AdminApiError ? cause : new AdminApiError('The record could not be saved.')
      setFormError(`${apiError.message}${apiError.traceId ? ` Reference: ${apiError.traceId}` : ''}`)
    } finally { setSaving(false) }
  }

  const handleSaveDetail = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateDetailForm()) {
      setDetailFormError('Please fix the validation errors below.')
      return
    }
    setSavingDetail(true)
    setDetailFormError('')
    try {
      const recordTitle = getRecordTitle(detailFormData, workflow.fields)
      const recordType = getRecordType(detailFormData, workflow.fields)

      await adminRequest<AdminRecord>(accessToken, `screens/${route.id}/records/${selectedRecordId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: recordTitle,
          recordType: recordType,
          status: detailRecord?.status ?? 'ACTIVE',
          branchId: selectedBranch === 'all' ? null : selectedBranch,
          data: detailFormData,
          version: detailRecord?.version ?? 1,
        }),
      })

      if (addToast) {
        addToast({
          title: 'Success',
          message: 'Changes saved successfully.',
          tone: 'success'
        })
      }

      setRevision((prev) => prev + 1)
    } catch (cause) {
      setDetailFormError(cause instanceof Error ? cause.message : 'Failed to save changes.')
    } finally {
      setSavingDetail(false)
    }
  }

  const deleteRecord = async () => {
    if (!selectedRecord) return
    setSaving(true)
    setFormError('')
    try {
      await adminRequest<never>(accessToken, `screens/${route.id}/records/${selectedRecord.id}`, { method: 'DELETE', body: JSON.stringify({ version: selectedRecord.version }) })
      setConfirmDelete(false)
      setDialogOpen(false)
      setSelectedRecord(null)
      setRevision((value) => value + 1)
      if (addToast) {
        addToast({
          title: 'Success',
          message: 'Record deleted successfully.',
          tone: 'success'
        })
      }
    } catch (cause) {
      const apiError = cause instanceof AdminApiError ? cause : new AdminApiError('The record could not be deleted.')
      setConfirmDelete(false)
      setFormError(`${apiError.message}${apiError.traceId ? ` Reference: ${apiError.traceId}` : ''}`)
    } finally { setSaving(false) }
  }

  const deleteDetailRecord = async () => {
    if (!detailRecord) return
    setSavingDetail(true)
    setDetailFormError('')
    try {
      await adminRequest<never>(accessToken, `screens/${route.id}/records/${detailRecord.id}`, { method: 'DELETE', body: JSON.stringify({ version: detailRecord.version }) })
      setConfirmDelete(false)
      setDetailRecord(null)
      if (addToast) {
        addToast({
          title: 'Success',
          message: 'Record deleted successfully.',
          tone: 'success'
        })
      }
      // Navigate back to list
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('branch')
      nextParams.delete('staff')
      nextParams.delete('student')
      nextParams.delete('enquiry')
      nextParams.delete('id')
      setSearchParams(nextParams)
    } catch (cause) {
      const apiError = cause instanceof AdminApiError ? cause : new AdminApiError('The record could not be deleted.')
      setConfirmDelete(false)
      setDetailFormError(`${apiError.message}${apiError.traceId ? ` Reference: ${apiError.traceId}` : ''}`)
    } finally { setSavingDetail(false) }
  }

  function renderFieldInput(
    field: WorkflowField,
    currentFormData: Record<string, any>,
    onChange: (key: string, value: any) => void
  ) {
    const val = currentFormData[field.key] ?? ''
    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            id={`field-${field.key}`}
            value={val}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        )
      case 'select':
        return (
          <select
            id={`field-${field.key}`}
            value={val}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            <option value="">Select option...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      case 'boolean':
        return (
          <div style={{ display: 'flex', alignItems: 'center', minHeight: '2.75rem' }}>
            <input
              id={`field-${field.key}`}
              type="checkbox"
              style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem', accentColor: 'var(--color-primary)' }}
              checked={!!currentFormData[field.key]}
              onChange={(e) => onChange(field.key, e.target.checked)}
            />
          </div>
        )
      case 'number':
        return (
          <input
            id={`field-${field.key}`}
            type="number"
            value={val}
            onChange={(e) => onChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
          />
        )
      case 'date':
        return (
          <input
            id={`field-${field.key}`}
            type="date"
            value={val}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        )
      case 'datetime':
        return (
          <input
            id={`field-${field.key}`}
            type="datetime-local"
            value={val}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        )
      case 'email':
        return (
          <input
            id={`field-${field.key}`}
            type="email"
            value={val}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        )
      case 'text':
      default:
        return (
          <input
            id={`field-${field.key}`}
            type="text"
            value={val}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        )
    }
  }

  function renderMockTabContent(screenId: string, tabName: string) {
    if (screenId === 'BR2') {
      if (tabName === 'Staff') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Designation</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Sarah Jenkins</strong></td>
                  <td>Principal</td>
                  <td>Branch Admin</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
                <tr>
                  <td><strong>Michael Chang</strong></td>
                  <td>Senior Teacher</td>
                  <td>Teacher</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
                <tr>
                  <td><strong>Emily Rodriguez</strong></td>
                  <td>Counselor</td>
                  <td>Staff</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Classes & Sections') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Room</th>
                  <th scope="col">Class Teacher</th>
                  <th scope="col">Capacity</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Class 1-A</strong></td>
                  <td>Room 101</td>
                  <td>Michael Chang</td>
                  <td>25/30</td>
                </tr>
                <tr>
                  <td><strong>Class 2-B</strong></td>
                  <td>Room 102</td>
                  <td>Sarah Jenkins</td>
                  <td>28/30</td>
                </tr>
                <tr>
                  <td><strong>Class 3-A</strong></td>
                  <td>Room 103</td>
                  <td>Unassigned</td>
                  <td>20/30</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Overrides') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Value</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Allow Local Calendar</strong></td>
                  <td>Holiday schedule</td>
                  <td>Enabled (Local exceptions)</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
                <tr>
                  <td><strong>Max Class Strength</strong></td>
                  <td>Admissions cap</td>
                  <td>35 students</td>
                  <td><span className="status-badge tone-warning">Override Active</span></td>
                </tr>
                <tr>
                  <td><strong>Custom Timezone</strong></td>
                  <td>Attendance tracking</td>
                  <td>Asia/Kolkata</td>
                  <td><span className="status-badge tone-neutral">Default</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
    }

    if (screenId === 'ST2') {
      if (tabName === 'Role Assignments') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Expiry</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Teacher</strong></td>
                  <td>All Classes</td>
                  <td>Permanent</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
                <tr>
                  <td><strong>Admissions Counselor</strong></td>
                  <td>Branch-wide</td>
                  <td>2027-06-30</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Classes Assigned') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Class & Section</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Timing</th>
                  <th scope="col">Weekly Hours</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Class 5-A</strong></td>
                  <td>Mathematics</td>
                  <td>09:00 - 10:00 AM</td>
                  <td>5 hrs</td>
                </tr>
                <tr>
                  <td><strong>Class 6-B</strong></td>
                  <td>Science</td>
                  <td>11:00 - 12:00 PM</td>
                  <td>4 hrs</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Attendance & Leave') {
        return (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Attendance Rate</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)', margin: '0.5rem 0' }}>96%</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>Present: 24 | Absent: 1 | Leave: 0</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Leave Type</th>
                    <th scope="col">Dates</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Sick Leave</strong></td>
                    <td>2026-05-12 to 2026-05-13</td>
                    <td>Flu</td>
                    <td><span className="status-badge tone-success">Approved</span></td>
                  </tr>
                  <tr>
                    <td><strong>Casual Leave</strong></td>
                    <td>2026-07-24</td>
                    <td>Personal work</td>
                    <td><span className="status-badge tone-warning">Pending</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    }

    if (screenId === 'SD2') {
      if (tabName === 'Family') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Guardian Name</th>
                  <th scope="col">Relation</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Email</th>
                  <th scope="col">Address</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Robert Vance</strong></td>
                  <td>Father</td>
                  <td>+1 555-0199</td>
                  <td>robert.vance@mail.com</td>
                  <td>123 Maple St</td>
                </tr>
                <tr>
                  <td><strong>Linda Vance</strong></td>
                  <td>Mother</td>
                  <td>+1 555-0188</td>
                  <td>linda.vance@mail.com</td>
                  <td>123 Maple St</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Enrollment History') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Academic Year</th>
                  <th scope="col">Grade / Class</th>
                  <th scope="col">Section</th>
                  <th scope="col">Roll No</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>2025-26</strong></td>
                  <td>Grade 4</td>
                  <td>A</td>
                  <td>Roll #14</td>
                  <td><span className="status-badge tone-success">Promoted</span></td>
                </tr>
                <tr>
                  <td><strong>2024-25</strong></td>
                  <td>Grade 3</td>
                  <td>B</td>
                  <td>Roll #12</td>
                  <td><span className="status-badge tone-success">Promoted</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Attendance') {
        return (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Attendance Rate</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)', margin: '0.5rem 0' }}>98.2%</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>Present: 165 days | Absent: 3 days</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Excused</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>2026-06-14</strong></td>
                    <td>Medical - Dentist</td>
                    <td>Yes</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      if (tabName === 'Academics') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Term 1</th>
                  <th scope="col">Term 2</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Mathematics</strong></td>
                  <td>88/100</td>
                  <td>92/100</td>
                  <td>A</td>
                  <td><span className="status-badge tone-success">Passed</span></td>
                </tr>
                <tr>
                  <td><strong>Science</strong></td>
                  <td>85/100</td>
                  <td>89/100</td>
                  <td>A-</td>
                  <td><span className="status-badge tone-success">Passed</span></td>
                </tr>
                <tr>
                  <td><strong>English</strong></td>
                  <td>90/100</td>
                  <td>94/100</td>
                  <td>A+</td>
                  <td><span className="status-badge tone-success">Passed</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Points & Batches') {
        return (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Total Points</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)', margin: '0.5rem 0' }}>450 pts</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>Class Rank: #4</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Badge Name</th>
                    <th scope="col">Awarded Date</th>
                    <th scope="col">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Perfect Attendance</strong></td>
                    <td>June 2026</td>
                    <td><span className="status-badge tone-warning">Gold</span></td>
                  </tr>
                  <tr>
                    <td><strong>Math Whiz</strong></td>
                    <td>May 2026</td>
                    <td><span className="status-badge tone-neutral">Silver</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      if (tabName === 'Fees') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fee Head</th>
                  <th scope="col">Due Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Tuition Fee - Q1</strong></td>
                  <td>2026-04-10</td>
                  <td>$1,200</td>
                  <td>$1,200</td>
                  <td>$0</td>
                  <td><span className="status-badge tone-success">Paid</span></td>
                </tr>
                <tr>
                  <td><strong>Tuition Fee - Q2</strong></td>
                  <td>2026-07-10</td>
                  <td>$1,200</td>
                  <td>$800</td>
                  <td>$400</td>
                  <td><span className="status-badge tone-warning">Partially Paid</span></td>
                </tr>
                <tr>
                  <td><strong>Activity Fee</strong></td>
                  <td>2026-09-01</td>
                  <td>$150</td>
                  <td>$0</td>
                  <td>$150</td>
                  <td><span className="status-badge tone-danger">Unpaid</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Documents') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Document Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Uploaded Date</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Birth Certificate.pdf</strong></td>
                  <td>Birth Proof</td>
                  <td>2024-05-15</td>
                  <td><span className="status-badge tone-success">Verified</span></td>
                </tr>
                <tr>
                  <td><strong>Medical Immunization.pdf</strong></td>
                  <td>Health Record</td>
                  <td>2024-05-15</td>
                  <td><span className="status-badge tone-success">Verified</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Consent') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Consent Type</th>
                  <th scope="col">Version</th>
                  <th scope="col">Signed Date</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Data Processing</strong></td>
                  <td>v1.2</td>
                  <td>2026-04-01</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
                <tr>
                  <td><strong>Photo Usage Consent</strong></td>
                  <td>v1.0</td>
                  <td>2026-04-01</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
                <tr>
                  <td><strong>Leaderboard Display</strong></td>
                  <td>v1.1</td>
                  <td>2026-04-02</td>
                  <td><span className="status-badge tone-success">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
    }

    if (screenId === 'AD3') {
      if (tabName === 'Application') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Field Label</th>
                  <th scope="col">Response Value</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Previous School Name</strong></td>
                  <td>Oakwood Elementary School</td>
                  <td><span className="status-badge tone-success">Verified</span></td>
                </tr>
                <tr>
                  <td><strong>Extracurricular Interests</strong></td>
                  <td>Soccer, Chess, Music</td>
                  <td><span className="status-badge tone-neutral">Provided</span></td>
                </tr>
                <tr>
                  <td><strong>Required Learning Accommodations</strong></td>
                  <td>None</td>
                  <td><span className="status-badge tone-neutral">Provided</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Visits & Tests') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Schedule Date</th>
                  <th scope="col">Status / Result</th>
                  <th scope="col">Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Campus Tour</strong></td>
                  <td>2026-06-10</td>
                  <td><span className="status-badge tone-success">Completed</span></td>
                  <td>Highly interested in science labs.</td>
                </tr>
                <tr>
                  <td><strong>Entrance Test</strong></td>
                  <td>2026-06-15</td>
                  <td><span className="status-badge tone-success">Passed (85/100)</span></td>
                  <td>Strong logical reasoning.</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Payments') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fee Description</th>
                  <th scope="col">Transaction ID</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Application Processing Fee</strong></td>
                  <td>TXN_7749102</td>
                  <td>$50</td>
                  <td>2026-06-05</td>
                  <td><span className="status-badge tone-success">Successful</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
      if (tabName === 'Communication Log') {
        return (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Channel</th>
                  <th scope="col">Date / Time</th>
                  <th scope="col">Staff</th>
                  <th scope="col">Summary</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>WhatsApp</strong></td>
                  <td>2026-06-16 11:30 AM</td>
                  <td>Emily Rodriguez</td>
                  <td>Sent entrance test result and offer letter.</td>
                </tr>
                <tr>
                  <td><strong>Phone Call</strong></td>
                  <td>2026-06-11 02:15 PM</td>
                  <td>Emily Rodriguez</td>
                  <td>Confirmed scheduling of entrance test for June 15.</td>
                </tr>
                <tr>
                  <td><strong>Email</strong></td>
                  <td>2026-06-05 09:00 AM</td>
                  <td>System Auto</td>
                  <td>Sent registration confirmation and portal links.</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      }
    }

    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <h3>No additional records to display for {tabName}</h3>
        <p>Mock data and logs will appear here in production.</p>
      </div>
    )
  }

  // --- RENDER DETAIL PAGE ---
  if (selectedRecordId && workflow.tabs && workflow.tabs.length > 0) {
    if (loadingDetail) {
      return (
        <div className="entity-page">
          <PageSkeleton name="operational-record-detail" label="Loading record details" variant="detail" />
        </div>
      )
    }
    if (detailError) {
      return (
        <div className="entity-page">
          <div className="inline-error" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>{detailError}</strong></span>
            <div>
              <button className="button-primary" type="button" onClick={() => setRevision((value) => value + 1)}>Try again</button>
              <button className="button-secondary" style={{ marginLeft: '0.5rem' }} type="button" onClick={() => {
                const nextParams = new URLSearchParams(searchParams)
                nextParams.delete('branch')
                nextParams.delete('staff')
                nextParams.delete('student')
                nextParams.delete('enquiry')
                nextParams.delete('id')
                setSearchParams(nextParams)
              }}>Back to list</button>
            </div>
          </div>
        </div>
      )
    }
    if (!detailRecord) return null

    return (
      <div className="entity-page">
        <div className="page-heading">
          <div>
            <p className="breadcrumb">{route.breadcrumb} / Detail</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {detailRecord.title}
              <span className="status-badge tone-success" style={{ fontSize: '0.875rem' }}>{detailRecord.status}</span>
            </h1>
            <p className="page-subtitle">{workflow.description}</p>
          </div>
          <div className="page-actions">
            <button className="button-secondary" type="button" onClick={() => {
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('branch')
              nextParams.delete('staff')
              nextParams.delete('student')
              nextParams.delete('enquiry')
              nextParams.delete('id')
              setSearchParams(nextParams)
            }}>Back to List</button>
            <button className="button-secondary" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} type="button" onClick={() => setConfirmDelete(true)}>Delete</button>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <Card>
            {/* Tabs Navigation */}
          <div className="admin-tabs__list" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
            {workflow.tabs.map((tabName, index) => (
              <button
                key={tabName}
                type="button"
                className={`admin-tab-btn ${activeTab === index ? 'is-active' : ''}`}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === index ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: activeTab === index ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab(index)}
              >
                {tabName}
              </button>
            ))}
          </div>

          {/* Tab Content Panel */}
          <div className="admin-tabs__panel">
            {activeTab === 0 ? (
              <form onSubmit={handleSaveDetail} className="admin-form-grid" noValidate>
                {detailFormError && <div className="admin-error-summary" role="alert" style={{ marginBottom: '1rem' }}>{detailFormError}</div>}
                
                {workflow.fields.map((field) => (
                  <FormField
                    key={field.key}
                    id={`detail-${field.key}`}
                    label={field.label}
                    required={field.required}
                    hint={field.hint}
                    error={detailValidationErrors[field.key]}
                  >
                    {renderFieldInput(field, detailFormData, handleDetailFieldChange)}
                  </FormField>
                ))}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button className="button-primary" type="submit" disabled={savingDetail}>
                    {savingDetail ? 'Saving...' : (workflow.primaryAction || 'Save Changes')}
                  </button>
                </div>
              </form>
            ) : (
              renderMockTabContent(route.id, workflow.tabs[activeTab])
            )}
          </div>
        </Card>
      </div>

        <ConfirmationDialog open={confirmDelete} title={`Delete ${detailRecord.title}?`} consequence="This removes the record from the active screen. This action is recorded and cannot be undone from the admin panel." confirmLabel="Delete record" busy={savingDetail} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteDetailRecord()} />
      </div>
    )
  }

  const hasReferenceLayout = new Set(['AD4', 'AT2', 'ST3', 'AC4', 'AC5', 'AC6', 'CM1', 'CM2', 'TT1', 'FN1', 'RG1', 'RG2', 'RG4', 'RG5', 'RG6', 'RA1', 'AL1', 'SE2', 'SE3', 'SE4']).has(route.id)
  if (hasReferenceLayout) return (
    <>
      <ReferenceOperationalLayouts
        route={route}
        onOpenAction={(action, context) => openReferenceAction(action, context)}
        onNavigate={(destination, context) => navigateReference(typeof destination === 'string' ? destination : destination.path, context)}
      />
      <AdmissionsAttendanceLayouts
        route={route}
        onOpenAction={(action, context) => openReferenceAction(action, context)}
        onNavigate={navigateReference}
      />
      <DedicatedOperationalLayouts
        route={route}
        onOpenModal={() => openCreate()}
        onAction={(action) => openReferenceAction(action.type === 'create' ? 'create-record' : action.type === 'delete' ? 'delete-record' : `${action.type}-${action.target ?? 'record'}`, action.target ? { target: action.target } : undefined)}
        onNavigate={navigateReference}
      />
      <Modal open={dialogOpen} title={data?.screen?.primaryAction ?? `Create ${route.label}`} description={`Complete the ${route.label.toLowerCase()} workflow for the active institute context.`} onClose={() => { if (!saving) setDialogOpen(false) }} footer={<><button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</button><button className="admin-button admin-button--primary" type="submit" form="reference-record-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
        <form id="reference-record-form" className="admin-form-grid" onSubmit={saveRecord} noValidate>
          {formError && <div className="admin-error-summary" role="alert">{formError}</div>}
          {workflow.fields.map((field) => <FormField key={field.key} id={`reference-${field.key}`} label={field.label} required={field.required} hint={field.hint} error={validationErrors[field.key]}>{renderFieldInput(field, formData, handleFieldChange)}</FormField>)}
        </form>
      </Modal>
    </>
  )

  // --- RENDER LIST PAGE ---
  const records = data?.records?.items ?? []
  const total = data?.records?.count ?? 0
  if (!data && !error) return <div className="entity-page"><PageSkeleton name="operational-list" label={`Loading ${route.label}`} /></div>
  return (
    <div className="entity-page">
      <div className="page-heading">
        <div><p className="breadcrumb">{route.breadcrumb}</p><h1>{route.label}</h1><p className="page-subtitle">{data?.screen?.description ?? route.description ?? `Manage ${route.label.toLowerCase()} for the active institute context.`}</p></div>
        <div className="page-actions">
          <button className="button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" />Refresh</button>
          {!workflow.readOnly && <button className="button-primary" type="button" onClick={openCreate}><Plus aria-hidden="true" />{data?.screen?.primaryAction ?? `Add ${route.label}`}</button>}
        </div>
      </div>
      {error && <div className="inline-error" role="alert"><strong>{error.message}</strong>{error.traceId && <small> Reference: {error.traceId}</small>}<button type="button" onClick={() => setRevision((value) => value + 1)}>Try again</button></div>}
      <Card className="entity-table-card">
        <SectionHeader title={`${route.label} (${total})`} />
        <div className="table-toolbar"><label><span className="sr-only">Search {route.label}</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={`Search {route.label.toLowerCase()}…`} /></label><select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 25 | 50 | 100); setPage(1) }}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></div>
        {records.length ? (
          <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Last updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.title}</strong></td><td>{record.recordType}</td><td><span className="status-badge">{record.status}</span></td><td>{record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '—'}</td><td><button className="table-action" type="button" onClick={() => openEdit(record)}>View / edit</button></td></tr>)}</tbody></table></div>
        ) : !error && <div className="empty-state"><h2>No records yet</h2><p>Create the first record for this screen. New data is saved to the active institute and branch context.</p>{!workflow.readOnly && <button className="button-primary" type="button" onClick={openCreate}><Plus aria-hidden="true" />{data?.screen?.primaryAction ?? 'Create record'}</button>}</div>}
        {data?.records && data.records.totalPages > 1 && <nav className="pagination" aria-label={`${route.label} pagination`}><button type="button" disabled={!data.records.previous} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {data.records.page} of {data.records.totalPages}</span><button type="button" disabled={!data.records.next} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
      </Card>
      <Modal open={dialogOpen} title={selectedRecord ? `Edit ${selectedRecord.title}` : data?.screen?.primaryAction ?? `Add ${route.label}`} description={`${selectedRecord ? 'Update' : 'Create'} a ${route.label.toLowerCase()} record in the active context.`} onClose={() => { if (!saving) setDialogOpen(false) }} footer={<>{selectedRecord && <button className="admin-button admin-button--danger" type="button" disabled={saving} onClick={() => setConfirmDelete(true)}>Delete</button>}<button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</button><button className="admin-button admin-button--primary" type="submit" form="admin-record-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>}>
        <form id="admin-record-form" className="admin-form-grid" onSubmit={saveRecord} noValidate>
          {formError && <div className="admin-error-summary" role="alert">{formError}</div>}
          
          {workflow.fields.map((field) => (
            <FormField
              key={field.key}
              id={`modal-${field.key}`}
              label={field.label}
              required={field.required}
              hint={field.hint}
              error={validationErrors[field.key]}
            >
              {renderFieldInput(field, formData, handleFieldChange)}
            </FormField>
          ))}
        </form>
      </Modal>
      <ConfirmationDialog open={confirmDelete} title={`Delete ${selectedRecord?.title ?? 'record'}?`} consequence="This removes the record from the active screen. This action is recorded and cannot be undone from the admin panel." confirmLabel="Delete record" busy={saving} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteRecord()} />
    </div>
  )
}
