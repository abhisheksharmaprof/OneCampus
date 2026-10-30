import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, LockKeyhole } from 'lucide-react'
import { ErrorSummary, FormField, LoadingState, PageHeader, PageSkeleton, Tabs, WizardActions, WizardStepper, type FormError } from '../../components/admin-ui'
import { AdminApiError, createRole, getPermissionCatalog, listAllRoles, updateRole } from './access-control.api'
import { listAcademicYears, listSections } from '../academics/academics.api'
import { AccessControlError } from './AccessControlError'
import { apiErrorMessage, firstFieldError, moduleLabel, roleScope } from './access-control.utils'
import type { BranchOption, PermissionConfiguration, PermissionDefinition, PermissionGrant, Role } from './types'
import './access-control.css'

const steps = [
  { id: 'basics', label: 'Basics', description: 'Name and scope' },
  { id: 'permissions', label: 'Permissions', description: 'Access granted' },
  { id: 'review', label: 'Review', description: 'Confirm changes' },
] as const

export interface RoleBuilderPageProps {
  accessToken: string
  branches: readonly BranchOption[]
  roleId?: string
  cloneSourceId?: string
  delegablePermissionKeys?: readonly string[]
  pointCategories?: readonly { id: string; name: string }[]
  onSaved?: (role: Role) => void
  onCancel?: () => void
}

type Validation = { name?: string; branchId?: string; permissionKeys?: string }
const examPermissionKeys = ['assessment.create', 'assessment.view', 'assessment.edit', 'assessment.publish']
const examDraftPresetPermissionKeys = ['assessment.create', 'assessment.view', 'assessment.edit']

function grantsToOptions(grants: readonly PermissionGrant[]) {
  return Object.fromEntries(grants.filter((grant) => Object.keys(grant.configuration).length).map((grant) => [grant.permissionKey, grant.configuration]))
}

export function RoleBuilderPage({ accessToken, branches, roleId, cloneSourceId, delegablePermissionKeys, pointCategories = [], onSaved, onCancel }: RoleBuilderPageProps) {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissionDefinitions, setPermissionDefinitions] = useState<PermissionDefinition[]>([])
  const [catalogDelegableKeys, setCatalogDelegableKeys] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<AdminApiError | null>(null)
  const [revision, setRevision] = useState(0)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<'institute' | 'branch'>('institute')
  const [branchId, setBranchId] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [permissionOptions, setPermissionOptions] = useState<Record<string, PermissionConfiguration>>({})
  const [activeModule, setActiveModule] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [validation, setValidation] = useState<Validation>({})
  const [saveError, setSaveError] = useState<AdminApiError | null>(null)
  const [saving, setSaving] = useState(false)
  const editing = Boolean(roleId)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([listAllRoles(accessToken, { signal: controller.signal }), getPermissionCatalog(accessToken, controller.signal)]).then(([items, activeCatalog]) => {
      setRoles(items)
      setPermissionDefinitions(activeCatalog.permissions ?? [])
      setCatalogDelegableKeys(Array.isArray(activeCatalog.delegablePermissionKeys) ? activeCatalog.delegablePermissionKeys : null)
      const initial = items.find((role) => role.id === roleId)
      const clone = items.find((role) => role.id === cloneSourceId)
      const source = initial ?? clone
      if (source) {
        setName(initial ? source.name : `${source.name} copy`)
        setDescription(source.description)
        setScope(source.branchId ? 'branch' : 'institute')
        setBranchId(source.branchId ?? '')
        setSelectedKeys(new Set(source.permissionGrants.map((grant) => grant.permissionKey)))
        setPermissionOptions(grantsToOptions(source.permissionGrants))
        setTemplateId(source.id)
      }
      setLoadError(null)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setLoadError(cause instanceof AdminApiError ? cause : new AdminApiError('Role builder could not be loaded.'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, cloneSourceId, revision, roleId])

  const catalog = useMemo(() => {
    const definitions = new Map(permissionDefinitions.map((definition) => [definition.permissionKey, { ...definition, configuration: {} }]))
    roles.forEach((role) => role.permissionGrants.forEach((grant) => definitions.set(grant.permissionKey, grant)))
    return [...definitions.values()].sort((a, b) => a.module.localeCompare(b.module) || a.permissionKey.localeCompare(b.permissionKey))
  }, [permissionDefinitions, roles])
  const modules = useMemo(() => [...new Set(catalog.map((permission) => permission.module))], [catalog])
  const displayedModule = activeModule || modules[0] || ''
  const effectiveDelegableKeys = delegablePermissionKeys ?? catalogDelegableKeys
  const delegable = useMemo(() => effectiveDelegableKeys ? new Set(effectiveDelegableKeys) : null, [effectiveDelegableKeys])

  const chooseTemplate = (template: Role | null) => {
    setTemplateId(template?.id ?? 'blank')
    if (!template) {
      setSelectedKeys(new Set()); setPermissionOptions({}); setDescription('')
      return
    }
    setDescription(template.description)
    setSelectedKeys(new Set(template.permissionGrants.map((grant) => grant.permissionKey)))
    setPermissionOptions(grantsToOptions(template.permissionGrants))
  }

  const validateBasics = () => {
    const errors: Validation = {}
    const trimmed = name.trim()
    if (trimmed.length < 2) errors.name = 'Role name must contain at least 2 characters.'
    else if (trimmed.length > 100) errors.name = 'Role name must be 100 characters or fewer.'
    const targetBranch = scope === 'branch' ? branchId : null
    const duplicate = roles.some((role) => role.id !== roleId && role.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase() && role.branchId === targetBranch && !role.isSystemRole)
    if (!errors.name && duplicate) errors.name = 'A role with this name already exists at this scope.'
    if (scope === 'branch' && !branchId) errors.branchId = 'Select the branch this role applies to.'
    setValidation(errors)
    return Object.keys(errors).length === 0
  }

  const next = () => {
    if (step === 0 && !validateBasics()) return
    setStep((value) => Math.min(2, value + 1))
  }

  const togglePermission = (key: string) => {
    if (delegable && !delegable.has(key)) return
    setSelectedKeys((current) => {
      const nextKeys = new Set(current)
      if (nextKeys.has(key)) {
        nextKeys.delete(key)
        setPermissionOptions((currentOptions) => { const nextOptions = { ...currentOptions }; delete nextOptions[key]; return nextOptions })
        } else {
          nextKeys.add(key)
          if (examPermissionKeys.includes(key)) {
            setPermissionOptions((currentOptions) => ({ ...currentOptions, [key]: { schemaVersion: 1, examScope: 'assigned', classSectionIds: [], classSubjectPairs: [] } }))
          }
        }
      return nextKeys
    })
  }

  const pointsConfiguration = permissionOptions['points.award_manual'] ?? {}
  const maxPoints = typeof pointsConfiguration.maximumPerAward === 'number' ? pointsConfiguration.maximumPerAward : 20
  const allowedCategories = Array.isArray(pointsConfiguration.allowedCategoryIds) ? pointsConfiguration.allowedCategoryIds.filter((item): item is string => typeof item === 'string') : []
  const updatePoints = (configuration: PermissionConfiguration) => setPermissionOptions((current) => ({ ...current, 'points.award_manual': configuration }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateBasics()) { setStep(0); return }
    const missingScope = [...selectedKeys].find((key) => examPermissionKeys.includes(key) && (
      permissionOptions[key]?.schemaVersion !== 1
      || !['assigned', 'selected', 'branch', 'institute'].includes(String(permissionOptions[key]?.examScope))
      || (permissionOptions[key]?.examScope === 'selected' && (!Array.isArray(permissionOptions[key]?.classSectionIds) || permissionOptions[key].classSectionIds.length === 0))
    ))
    if (missingScope) { setValidation((current) => ({ ...current, permissionKeys: `Configure an authorized scope for ${missingScope}.` })); setStep(1); return }
    setValidation((current) => ({ ...current, permissionKeys: undefined }))
    setSaving(true); setSaveError(null)
    const selectedOptions = Object.fromEntries(Object.entries(permissionOptions).filter(([key]) => selectedKeys.has(key)))
    const input = { name: name.trim(), description: description.trim(), branchId: scope === 'branch' ? branchId : null, permissionKeys: [...selectedKeys].sort(), permissionOptions: selectedOptions }
    try {
      const saved = roleId ? await updateRole(accessToken, roleId, input) : await createRole(accessToken, input)
      onSaved?.(saved)
    } catch (cause) {
      const error = cause instanceof AdminApiError ? cause : new AdminApiError('The role could not be saved.')
      setSaveError(error)
      if (firstFieldError(error, 'name') || firstFieldError(error, 'branchId')) setStep(0)
      else if (firstFieldError(error, 'permissionKeys') || firstFieldError(error, 'permissionOptions')) setStep(1)
    } finally { setSaving(false) }
  }

  const formErrors: FormError[] = [
    ...(validation.name ? [{ fieldId: 'role-name', label: 'Role name', message: validation.name }] : []),
    ...(validation.branchId ? [{ fieldId: 'role-branchId', label: 'Branch', message: validation.branchId }] : []),
    ...(validation.permissionKeys ? [{ fieldId: 'permission-matrix', label: 'Permission scope', message: validation.permissionKeys }] : []),
  ]
  const saveFieldErrors: FormError[] = saveError ? Object.entries(saveError.fieldErrors).flatMap(([field, messages]) => messages.map((message) => ({ fieldId: field === 'name' ? 'role-name' : field === 'branchId' ? 'role-branchId' : 'permission-matrix', label: field, message }))) : []

  if (loading) return <div className="entity-page ac-page"><PageSkeleton name="role-builder" label="Loading role builder" variant="form" /></div>
  if (loadError) return <div className="entity-page ac-page"><AccessControlError error={loadError} onRetry={() => setRevision((value) => value + 1)} /></div>

  const templates = roles.filter((role) => role.isActive && (!editing || role.id !== roleId))
  const tabs = modules.map((module) => ({
    id: module,
    label: <>{moduleLabel(module)} <span className="ac-count">{catalog.filter((permission) => permission.module === module && selectedKeys.has(permission.permissionKey)).length}</span></>,
    panel: <div className="ac-permission-list" id="permission-matrix">
      <h2>{moduleLabel(module)}</h2>
      {catalog.filter((permission) => permission.module === module).map((permission) => {
        const locked = delegable ? !delegable.has(permission.permissionKey) : permission.permissionKey.startsWith('institute.') || permission.permissionKey === 'points.approve_manual_award'
        const checked = selectedKeys.has(permission.permissionKey)
        return <div className={`ac-permission-row ${locked ? 'is-locked' : ''}`} key={permission.permissionKey} title={locked ? "You don't have this permission yourself, so you can't grant it." : undefined}>
          <label><input type="checkbox" checked={checked} disabled={locked} onChange={() => togglePermission(permission.permissionKey)} /><span><strong>{permission.description}</strong><code>{permission.permissionKey}</code>{permission.permissionKey === 'leaderboard.configure' ? <small>Controls who can change leaderboard scope and visibility, separate from viewing rankings.</small> : null}</span>{locked ? <LockKeyhole aria-label="You cannot grant this permission" /> : null}</label>
          {permission.permissionKey === 'points.award_manual' && checked ? <div className="ac-permission-options">
            <FormField id="points-maximum" label="Maximum per single award" hint="points"><input type="number" min={1} step={1} value={maxPoints} onChange={(event) => updatePoints({ ...pointsConfiguration, maximumPerAward: Math.max(1, Number(event.target.value) || 1), allowedCategoryIds: allowedCategories })} /></FormField>
            {pointCategories.length ? <fieldset><legend>Allowed categories</legend><div className="ac-chip-options">{pointCategories.map((category) => <label key={category.id}><input type="checkbox" checked={allowedCategories.includes(category.id)} onChange={() => updatePoints({ ...pointsConfiguration, maximumPerAward: maxPoints, allowedCategoryIds: allowedCategories.includes(category.id) ? allowedCategories.filter((id) => id !== category.id) : [...allowedCategories, category.id] })} /><span>{category.name}</span></label>)}</div></fieldset> : <p className="ac-muted">Point categories were not supplied by the integration; no category restriction will be saved.</p>}
          </div> : null}
          {examPermissionKeys.includes(permission.permissionKey) && checked ? <AssessmentPermissionScope accessToken={accessToken} roleBranchId={scope === 'branch' ? branchId : null} permissionKey={permission.permissionKey} configuration={permissionOptions[permission.permissionKey] ?? {}} onChange={(configuration) => setPermissionOptions((current) => ({ ...current, [permission.permissionKey]: configuration }))} /> : null}
        </div>
      })}
    </div>,
  }))

  return <div className="entity-page ac-page ac-builder">
    <PageHeader title={editing ? 'Edit role' : 'Create role'} breadcrumbs={[{ label: 'Roles & Permissions' }, { label: 'All Roles' }, { label: editing ? 'Edit role' : 'Role Builder' }]} description="Build the smallest set of access needed, then review it before saving." />
    <WizardStepper steps={steps} currentStep={step} onStepChange={setStep} />
    <form className="ac-builder-form" onSubmit={submit} noValidate>
      {(formErrors.length || saveError) ? <><ErrorSummary errors={[...formErrors, ...(saveFieldErrors.length ? saveFieldErrors : saveError ? [{ fieldId: 'role-name', message: apiErrorMessage(saveError) }] : [])]} />{saveError?.traceId ? <p className="ac-trace">Reference: {saveError.traceId}</p> : null}</> : null}
      {step === 0 ? <div className="ac-builder-step">
        {!editing ? <section><h2>Start from a template</h2><div className="ac-template-list" role="radiogroup" aria-label="Role template"><button type="button" role="radio" aria-checked={templateId === 'blank'} className={templateId === 'blank' ? 'is-selected' : ''} onClick={() => chooseTemplate(null)}><strong>Blank</strong><span>Start without permissions</span></button>{templates.map((role) => <button type="button" role="radio" aria-checked={templateId === role.id} className={templateId === role.id ? 'is-selected' : ''} key={role.id} onClick={() => chooseTemplate(role)}><strong>{role.name}</strong><span>{roleScope(role, branches)} · {role.permissionCount} permissions</span></button>)}</div></section> : null}
        <section><h2>Role details</h2><div className="admin-form-grid"><FormField id="role-name" label="Role name" required error={validation.name ?? firstFieldError(saveError, 'name')}><input value={name} maxLength={100} onChange={(event) => { setName(event.target.value); setValidation((current) => ({ ...current, name: undefined })) }} /></FormField><FormField id="role-description" label="Description" hint="Optional; describe who should receive this role."><textarea rows={2} maxLength={255} value={description} onChange={(event) => setDescription(event.target.value)} /></FormField></div></section>
        <fieldset className="ac-scope"><legend>Scope</legend><label><input type="radio" name="scope" checked={scope === 'institute'} onChange={() => { setScope('institute'); setValidation((current) => ({ ...current, branchId: undefined })) }} /><span><strong>All branches of this institute</strong><small>Access applies institute-wide.</small></span></label><label><input type="radio" name="scope" checked={scope === 'branch'} onChange={() => setScope('branch')} /><span><strong>This role applies to one branch</strong><small>Access is limited to the selected branch.</small></span></label>{scope === 'branch' ? <FormField id="role-branchId" label="Branch" required error={validation.branchId ?? firstFieldError(saveError, 'branchId')}><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setValidation((current) => ({ ...current, branchId: undefined })) }}><option value="">Select a branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></FormField> : null}</fieldset>
      </div> : null}
      {step === 1 ? <div className="ac-builder-step ac-matrix"><div className="ac-section-heading"><div><h2>Permission matrix</h2><p>{selectedKeys.size} permissions selected</p></div></div>{examDraftPresetPermissionKeys.every((key) => catalog.some((permission) => permission.permissionKey === key) && (!delegable || delegable.has(key))) ? <div className="ac-exam-preset"><strong>Exam draft manager preset</strong><span>Quickly add create, view, and edit access. Add publish access separately with its own scope.</span><button className="admin-button admin-button--secondary" type="button" onClick={() => { setSelectedKeys((current) => new Set([...current, ...examDraftPresetPermissionKeys])); setPermissionOptions((current) => ({ ...current, ...Object.fromEntries(examDraftPresetPermissionKeys.map((key) => [key, current[key] ?? { schemaVersion: 1, examScope: 'assigned', classSectionIds: [], classSubjectPairs: [] }])) })) }}>Add preset</button></div> : null}<div className="ac-live-preview"><strong>Live impact preview</strong>{selectedKeys.size ? <span>{catalog.filter((permission) => selectedKeys.has(permission.permissionKey)).map((permission) => permission.description).join(' · ')}</span> : <span>No permissions selected yet.</span>}</div>{tabs.length ? <Tabs tabs={tabs} activeId={displayedModule} onChange={setActiveModule} label="Permission modules" /> : <AccessControlError error={new AdminApiError('No permissions are available from the active permission catalog.')} />}</div> : null}
      {step === 2 ? <div className="ac-builder-step ac-review"><section><h2>Plain-English summary</h2><div className="ac-review-card">{selectedKeys.size ? <ul>{catalog.filter((permission) => selectedKeys.has(permission.permissionKey)).map((permission) => <li key={permission.permissionKey}><Check aria-hidden="true" /><span>{permission.description}{permission.permissionKey === 'points.award_manual' ? `, up to ${maxPoints} points per award` : ''}</span></li>)}</ul> : <p>This role does not grant any permissions.</p>}</div></section><section><h2>Scope recap</h2><p>This role will apply to: <strong>{scope === 'institute' ? 'All branches' : branches.find((branch) => branch.id === branchId)?.name ?? 'No branch selected'}</strong>.</p></section></div> : null}
      <WizardActions status={saving ? 'Saving role…' : `Step ${step + 1} of ${steps.length}`}><button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={() => step ? setStep((value) => value - 1) : onCancel?.()}>{step ? 'Back' : 'Cancel'}</button>{step < 2 ? <button className="admin-button admin-button--primary" type="button" onClick={next}>Continue</button> : <button className="admin-button admin-button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create role'}</button>}</WizardActions>
    </form>
  </div>
}

function AssessmentPermissionScope({ accessToken, roleBranchId, permissionKey, configuration, onChange }: {
  accessToken: string; roleBranchId: string | null; permissionKey: string
  configuration: PermissionConfiguration; onChange: (configuration: PermissionConfiguration) => void
}) {
  const examScope = ['assigned', 'selected', 'branch', 'institute'].includes(String(configuration.examScope)) ? String(configuration.examScope) : ''
  const [years, setYears] = useState<Array<{ id: string; name: string }>>([])
  const [yearId, setYearId] = useState('')
  const [sections, setSections] = useState<Array<{ id: string; name: string; grade: { name: string }; sectionName: string }>>([])
  const [loadedSectionsFor, setLoadedSectionsFor] = useState('')
  const [error, setError] = useState('')
  const sectionsQueryKey = `${accessToken}:${examScope}:${roleBranchId}:${yearId}`
  const loading = examScope === 'selected' && Boolean(yearId) && loadedSectionsFor !== sectionsQueryKey
  const visibleSections = examScope === 'selected' && yearId ? sections : []

  useEffect(() => {
    const controller = new AbortController()
    listAcademicYears(accessToken, { page: 1, pageSize: 100, ...(roleBranchId ? { branchId: roleBranchId } : {}) }, controller.signal).then((page) => {
      setYears(page.items)
      setYearId((current) => current || page.items.find((item) => item.isCurrent)?.id || page.items[0]?.id || '')
    }).catch(() => { if (!controller.signal.aborted) setError('Academic years could not be loaded.') })
    return () => controller.abort()
  }, [accessToken, roleBranchId])

  useEffect(() => {
    if (examScope !== 'selected' || !yearId) return
    const controller = new AbortController()
    const requestKey = `${accessToken}:${examScope}:${roleBranchId}:${yearId}`
    listSections(accessToken, { page: 1, pageSize: 100, academicYearId: yearId, ...(roleBranchId ? { branchId: roleBranchId } : {}) }, controller.signal).then(async (first) => {
      const rest = await Promise.all(Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => listSections(accessToken, { page: index + 2, pageSize: 100, academicYearId: yearId, ...(roleBranchId ? { branchId: roleBranchId } : {}) }, controller.signal)))
      return [first, ...rest].flatMap((page) => page.items)
    }).then((items) => {
      setSections(items.map((item) => ({ id: item.id, name: `${item.grade.name} ${item.sectionName}`, grade: item.grade, sectionName: item.sectionName })))
      setError('')
    }).catch(() => { if (!controller.signal.aborted) setError('Class sections could not be loaded.') }).finally(() => { if (!controller.signal.aborted) setLoadedSectionsFor(requestKey) })
    return () => controller.abort()
  }, [accessToken, examScope, roleBranchId, yearId])

  const selectedIds = Array.isArray(configuration.classSectionIds) ? configuration.classSectionIds.filter((value): value is string => typeof value === 'string') : []
  const setScope = (value: 'assigned' | 'selected' | 'branch' | 'institute') => onChange({ schemaVersion: 1, examScope: value, classSectionIds: value === 'selected' ? selectedIds : [], classSubjectPairs: [] })
  const setSectionsSelected = (id: string) => onChange({ schemaVersion: 1, examScope: 'selected', classSectionIds: selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id], classSubjectPairs: [] })
  return <fieldset className="ac-permission-options ac-assessment-scope">
    <legend>Exam target scope for {permissionKey.replace('assessment.', '')}</legend>
    <label className="ac-assessment-scope-choice"><input type="radio" name={`scope-${permissionKey}`} checked={examScope === 'assigned'} onChange={() => setScope('assigned')} /><span><strong>Assigned classes</strong><small>Classes and sections assigned to this staff member.</small></span></label>
    <label className="ac-assessment-scope-choice"><input type="radio" name={`scope-${permissionKey}`} checked={examScope === 'selected'} onChange={() => setScope('selected')} /><span><strong>Selected sections</strong><small>Choose specific academic-year sections.</small></span></label>
    {roleBranchId ? <label className="ac-assessment-scope-choice"><input type="radio" name={`scope-${permissionKey}`} checked={examScope === 'branch'} onChange={() => setScope('branch')} /><span><strong>This branch</strong><small>All sections in the branch selected for this role.</small></span></label> : <label className="ac-assessment-scope-choice"><input type="radio" name={`scope-${permissionKey}`} checked={examScope === 'branch'} onChange={() => setScope('branch')} /><span><strong>Authorized branches</strong><small>All sections in branches this role assignment can access.</small></span></label>}
    {!roleBranchId ? <label className="ac-assessment-scope-choice"><input type="radio" name={`scope-${permissionKey}`} checked={examScope === 'institute'} onChange={() => setScope('institute')} /><span><strong>Entire institute</strong><small>Only use for institute-wide roles and assignments.</small></span></label> : null}
    {examScope === 'selected' && <div className="ac-selected-sections">
      <FormField id={`assessment-year-${permissionKey}`} label="Academic year"><select value={yearId} onChange={(event) => setYearId(event.target.value)}><option value="">Select year</option>{years.map((year) => <option value={year.id} key={year.id}>{year.name}</option>)}</select></FormField>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <LoadingState label="Loading authorized sections" rows={4} /> : visibleSections.length ? <div className="ac-chip-options">{visibleSections.map((section) => <label key={section.id}><input type="checkbox" checked={selectedIds.includes(section.id)} onChange={() => setSectionsSelected(section.id)} /><span>{section.name}</span></label>)}</div> : !error ? <p className="ac-muted">No sections are available for this year.</p> : null}
      <small>{selectedIds.length} section{selectedIds.length === 1 ? '' : 's'} selected. Subject restrictions are applied separately when subject scheduling is available.</small>
    </div>}
    {!examScope ? <p className="ac-muted" role="alert">Needs configuration. Select an exam scope before assigning this permission.</p> : null}
  </fieldset>
}
