import { adminRequest, type PageData } from '../admin/admin.api'

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK' | 'CHEQUE' | 'OTHER'

export type InvoiceLineItem = { description: string; period: string; qty: number; amount: string }

export type Invoice = {
  id: string
  invoiceNumber: string
  studentId: string
  studentName: string
  admissionNumber: string
  className: string
  status: InvoiceStatus
  issueDate: string | null
  dueDate: string
  lineItems: InvoiceLineItem[]
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
  notes: string
  templateId: string | null
  totalPaid: string
}

export type InvoiceWrite = {
  studentId: string
  issueDate: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  discountAmount: string
  taxAmount: string
  notes: string
  templateId: string | null
  status: 'DRAFT' | 'ISSUED'
}

export type Payment = {
  id: string
  receiptNumber: string
  invoiceId: string
  invoiceNumber: string
  studentId: string
  studentName: string
  admissionNumber: string
  amount: string
  method: PaymentMethod
  reference: string
  remarks: string
  paidAt: string
}

export type DueRow = {
  studentId: string
  studentName: string
  admissionNumber: string
  billed: string
  paid: string
  outstanding: string
  daysOverdue: number
}

export type FeePlanItem = { head: string; amount: string; period: string }

export type FeePlan = {
  id: string
  name: string
  academicYear: string
  appliesTo: string[]
  items: FeePlanItem[]
  isActive: boolean
  branchId: string | null
}

export type FinanceSettings = {
  invoicePrefix: string
  receiptPrefix: string
  taxLabel: string
  taxPercent: string
  invoiceFooter: string
  receiptFooter: string
}

export type FeeSummary = {
  collectedThisMonth: string
  outstandingTotal: string
  overdueCount: number
  receiptsToday: number
  monthlySeries: { month: string; collected: string }[]
}

export type InstituteBranding = {
  name: string
  logoUrl: string | null
  brandColor: string | null
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  gstNo?: string
  panNo?: string
  registrationNo?: string
  primaryEmail?: string
  primaryPhone?: string
  websiteUrl?: string
  contactName?: string
  contactDesignation?: string
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export type InvoiceFilters = {
  page?: number
  pageSize?: number
  branchId?: string
  studentId?: string
  status?: string
  classId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export function listInvoices(accessToken: string, filters: InvoiceFilters, signal?: AbortSignal) {
  return adminRequest<PageData<Invoice>>(accessToken, `fees/invoices${query(filters)}`, { signal })
}

export function getInvoice(accessToken: string, invoiceId: string, signal?: AbortSignal) {
  return adminRequest<Invoice>(accessToken, `fees/invoices/${invoiceId}`, { signal })
}

export function createInvoice(accessToken: string, body: InvoiceWrite) {
  return adminRequest<Invoice>(accessToken, 'fees/invoices', { method: 'POST', body: JSON.stringify(body) })
}

export function patchInvoice(
  accessToken: string,
  invoiceId: string,
  body: Omit<Partial<InvoiceWrite>, 'status'> & { status?: 'DRAFT' | 'ISSUED' | 'CANCELLED' },
) {
  return adminRequest<Invoice>(accessToken, `fees/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function bulkGenerateInvoices(
  accessToken: string,
  body: { feePlanId: string; classIds: string[]; issueDate: string; dueDate: string; templateId?: string | null },
) {
  return adminRequest<{ created: number; skipped: number }>(accessToken, 'fees/invoices/bulk-generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type PaymentFilters = {
  page?: number
  pageSize?: number
  branchId?: string
  studentId?: string
  invoiceId?: string
  method?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export function listPayments(accessToken: string, filters: PaymentFilters, signal?: AbortSignal) {
  return adminRequest<PageData<Payment>>(accessToken, `fees/payments${query(filters)}`, { signal })
}

export function recordPayment(
  accessToken: string,
  body: { invoiceId: string; amount: string; method: PaymentMethod; reference?: string; remarks?: string },
) {
  return adminRequest<Payment>(accessToken, 'fees/payments', { method: 'POST', body: JSON.stringify(body) })
}

export function logDuesExport(
  accessToken: string,
  filters: { branchId?: string; classId?: string; minDaysOverdue?: number },
) {
  return adminRequest<{ logged: boolean }>(accessToken, 'fees/dues/export', {
    method: 'POST',
    body: JSON.stringify(filters),
  })
}

export function listDues(
  accessToken: string,
  filters: { page?: number; branchId?: string; classId?: string; minDaysOverdue?: number },
  signal?: AbortSignal,
) {
  return adminRequest<PageData<DueRow>>(accessToken, `fees/dues${query(filters)}`, { signal })
}

export function fetchSummary(accessToken: string, branchId?: string, signal?: AbortSignal) {
  return adminRequest<FeeSummary>(accessToken, `fees/summary${query({ branchId })}`, { signal })
}

export function listFeePlans(accessToken: string, includeInactive = false, signal?: AbortSignal) {
  return adminRequest<PageData<FeePlan>>(
    accessToken,
    // pageSize: 100 is a deliberate bound — fee plans are a small, curated list per institute;
    // callers needing more would need real pagination, not a higher cap.
    `fees/plans${query({ includeInactive: includeInactive ? 'true' : undefined, pageSize: 100 })}`,
    { signal },
  )
}

export function createFeePlan(accessToken: string, body: Omit<FeePlan, 'id' | 'isActive'> & { isActive?: boolean }) {
  return adminRequest<FeePlan>(accessToken, 'fees/plans', { method: 'POST', body: JSON.stringify(body) })
}

export function patchFeePlan(accessToken: string, planId: string, body: Partial<Omit<FeePlan, 'id'>>) {
  return adminRequest<FeePlan>(accessToken, `fees/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteFeePlan(accessToken: string, planId: string) {
  return adminRequest<void>(accessToken, `fees/plans/${planId}`, { method: 'DELETE' })
}

export function fetchFinanceSettings(accessToken: string, signal?: AbortSignal) {
  return adminRequest<FinanceSettings>(accessToken, 'finance/settings', { signal })
}

export function patchFinanceSettings(accessToken: string, body: Partial<FinanceSettings>) {
  return adminRequest<FinanceSettings>(accessToken, 'finance/settings', { method: 'PATCH', body: JSON.stringify(body) })
}

/**
 * Institute branding for invoice rendering — reuses the existing institute profile endpoint
 * (`GET /api/v1/admin/institute`, `CurrentInstituteView`). The serializer returns many more
 * fields (address, contact info, etc.) than we need here; we only type the subset used by the
 * finance suite. Verified against `InstituteProfileSerializer` in
 * services/api/modules/institutes/api/admin_serializers.py (logoUrl/brandColor fields) and the
 * existing usage in apps/institute-admin-web/src/features/institute/BrandingPage.tsx.
 */
export async function fetchInstituteBranding(accessToken: string, signal?: AbortSignal): Promise<InstituteBranding> {
  type BrandingProfile = {
    id: string
    name: string
    displayName?: string
    logoUrl?: string | null
    brandColor?: string | null
    address_line_1?: string
    address_line_2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    gstNo?: string
    panNo?: string
    registrationNo?: string
    primaryEmail?: string
    primaryPhone?: string
    websiteUrl?: string
    contactName?: string
    contactDesignation?: string
  }
  type LogoAsset = { url?: string | null }
  const profile = await adminRequest<BrandingProfile>(accessToken, 'institute', { signal })
  let uploadedLogoUrl: string | null = null
  try {
    const assets = await adminRequest<LogoAsset[]>(
      accessToken,
      `files?ownerType=INSTITUTE&ownerId=${encodeURIComponent(profile.id)}&assetType=LOGO`,
      { signal },
    )
    uploadedLogoUrl = assets[0]?.url ?? null
  } catch {
    // A missing optional asset must not block invoice creation or printing.
  }
  return {
    name: profile.displayName || profile.name,
    logoUrl: uploadedLogoUrl || profile.logoUrl || null,
    brandColor: profile.brandColor ?? null,
    addressLine1: profile.address_line_1,
    addressLine2: profile.address_line_2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    gstNo: profile.gstNo,
    panNo: profile.panNo,
    registrationNo: profile.registrationNo,
    primaryEmail: profile.primaryEmail,
    primaryPhone: profile.primaryPhone,
    websiteUrl: profile.websiteUrl,
    contactName: profile.contactName,
    contactDesignation: profile.contactDesignation,
  }
}

/**
 * Students search for the invoice editor / record-payment flow (existing endpoint,
 * `GET /api/v1/admin/students`, `StudentListCreateView`). The endpoint filters by `search`
 * (matches first/last name or admission number) and supports standard pagination. The
 * serializer has no `fullName` field — it returns `firstName`/`lastName` separately, mirroring
 * apps/institute-admin-web/src/features/people/StudentsPage.tsx's local `Student` type.
 */
export type StudentOption = { id: string; firstName: string; lastName: string; admissionNumber: string }

export function searchStudents(accessToken: string, search: string, signal?: AbortSignal) {
  return adminRequest<PageData<StudentOption>>(accessToken, `students${query({ search, pageSize: 10 })}`, { signal })
}

/**
 * Grades (classes) for fee-plan applicability and invoice filters (existing endpoint,
 * `GET /api/v1/admin/academics/classes`, `GradeListCreateView` — mounted under the
 * `academics/` prefix, not bare `classes`). `GradeSerializer` also returns `sortOrder`,
 * `subjectsCount`, `createdAt`, `updatedAt`, but only `id`/`name` are needed here.
 */
export type GradeOption = { id: string; name: string }

export function listGrades(accessToken: string, signal?: AbortSignal) {
  // pageSize: 100 is a deliberate bound — the number of grades/classes at an institute is small
  // and finite (not paginated in the UI).
  return adminRequest<PageData<GradeOption>>(accessToken, `academics/classes${query({ pageSize: 100 })}`, { signal })
}
