import { identityRequest } from '../admin/admin.api'

export interface AccountProfile {
  id: string
  displayName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  phoneVerified: boolean
  photoUrl: string | null
  alternateEmail: string
  alternateEmailVerified: boolean
  activeRole: string
  roles: string[]
  institute: string | null
  branch: string | null
  personal: Record<string, string | null>
  workExperience: { qualification: string; experienceYears: number | null; previousWorkplace: string }
  staff: null | {
    institute: string
    employeeCode: string
    department: string
    employmentType: string
    joiningDate: string | null
    shift: string
    workLocation: string
    importable: Record<string, string | number>
  }
}

export function getAccountProfile(accessToken: string) {
  return identityRequest<AccountProfile>(accessToken, 'account')
}

export function updateAccountProfile(accessToken: string, values: {
  alternateEmail?: string
  qualification?: string
  experienceYears?: number | null
  previousWorkplace?: string
}) {
  return identityRequest<AccountProfile>(accessToken, 'account', {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export async function uploadAccountPhoto(accessToken: string, file: File) {
  const body = new FormData()
  body.append('file', file, file.name)
  return identityRequest<{ photoUrl: string }>(accessToken, 'account/photo', { method: 'POST', body })
}

export function importAccountFields(accessToken: string, fields: string[]) {
  return identityRequest<{ imported: string[]; skipped: string[]; profile: AccountProfile }>(
    accessToken,
    'account/import-from-active-staff',
    { method: 'POST', body: JSON.stringify({ fields }) },
  )
}
