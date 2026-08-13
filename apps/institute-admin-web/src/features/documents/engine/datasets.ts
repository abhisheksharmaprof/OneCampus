/** Per-category configuration: merge-field token groups, table datasets with sample
 *  rows, and live-binding adapters (fees in Phase 1; marks/ID/certificate are sampled). */

import type { Invoice, InstituteBranding, Payment } from '../../finance/finance.api'
import type { DocumentCategory, DocumentData, PageSizeId, TableColumn } from './types'

export interface TokenGroup { source: string; fields: string[] }
export interface DatasetDef { id: string; label: string; columns: TableColumn[]; sampleRows: Record<string, unknown>[] }
export interface CategoryConfig {
  label: string
  pageSizeIds: PageSizeId[]
  pageCount: 1 | 2
  tokenGroups: TokenGroup[]
  datasets: DatasetDef[]
}

const SCHOOL_TOKENS: TokenGroup = { source: 'School', fields: ['school_name', 'school_address', 'school_gstin', 'authorised_signatory'] }
const STUDENT_TOKENS: TokenGroup = { source: 'Student', fields: ['student_name', 'student_id', 'class_section', 'roll_no', 'guardian_name'] }

export const SAMPLE_TOKENS: Record<string, string> = {
  student_name: 'Aarav Sharma', student_id: 'ADM-1042', class_section: 'Grade 8-A', roll_no: '14',
  guardian_name: 'Mr. Rakesh Sharma', staff_name: 'Priya Verma', staff_id: 'EMP-011', designation: 'Senior Teacher',
  invoice_no: 'INV-2026-0001', invoice_date: '12 Aug 2026', due_date: '31 Aug 2026', payment_status: 'Pending',
  receipt_no: 'RCP-2026-0001', payment_method: 'UPI',
  exam_name: 'Term 1 Examination', event_name: 'Annual Science Fair', academic_year: 'AY 2026-27',
  issue_date: '13 Aug 2026',
  school_name: 'Step Next Academy', school_address: 'Jodhpur, Rajasthan',
  school_gstin: '08AAAAA0000A1Z5', authorised_signatory: 'Principal',
}

const col = (id: string, label: string, extra: Partial<TableColumn> = {}): TableColumn => ({
  id, label, type: 'data', dtype: 'text', widthPct: 20, align: 'left', ...extra,
})

/** Data contract: c4 = per-unit rate; c6 = precomputed line total (rate × qty) —
 *  receipt tables read c6 since they have no Qty/Rate columns to compute from. */
export const FEE_ITEMS_DATASET: DatasetDef = {
  id: 'fee_items', label: 'Fee items',
  columns: [
    col('c1', 'Description', { widthPct: 38 }),
    col('c2', 'Period', { widthPct: 16 }),
    col('c3', 'Qty', { dtype: 'number', widthPct: 10, align: 'center' }),
    col('c4', 'Rate', { dtype: 'number', widthPct: 16, align: 'right' }),
    col('c5', 'Amount', { type: 'formula', formula: '=[Qty]*[Rate]', widthPct: 20, align: 'right' }),
  ],
  sampleRows: [
    { c1: 'Tuition fee', c2: 'Term 1', c3: 1, c4: 15000, c6: 15000 },
    { c1: 'Transport fee', c2: 'Term 1', c3: 1, c4: 3000, c6: 3000 },
  ],
}

export const MARKS_DATASET: DatasetDef = {
  id: 'marks', label: 'Mark sheet',
  columns: [
    col('c1', 'Subject', { widthPct: 54 }),
    col('c2', 'Max marks', { dtype: 'number', widthPct: 16, align: 'right' }),
    col('c3', 'Marks', { dtype: 'number', widthPct: 16, align: 'right' }),
    col('c4', 'Grade', {
      type: 'formula', widthPct: 14, align: 'center',
      formula: '=IF([Marks]>=91,"A1",IF([Marks]>=81,"A2",IF([Marks]>=71,"B1",IF([Marks]>=61,"B2",IF([Marks]>=51,"C1",IF([Marks]>=41,"C2",IF([Marks]>=33,"D","E")))))))',
    }),
  ],
  sampleRows: [
    { c1: 'English', c2: 100, c3: 88 }, { c1: 'Mathematics', c2: 100, c3: 95 },
    { c1: 'Science', c2: 100, c3: 79 }, { c1: 'Social Science', c2: 100, c3: 84 },
    { c1: 'Hindi', c2: 100, c3: 91 },
  ],
}

export const CATEGORY_CONFIG: Record<DocumentCategory, CategoryConfig> = {
  FEE_INVOICE: {
    label: 'Fee Invoice', pageSizeIds: ['A4P', 'A4P_HALF_TOP', 'A4P_HALF_BOTTOM'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Invoice', fields: ['invoice_no', 'invoice_date', 'due_date', 'payment_status'] },
      SCHOOL_TOKENS,
    ],
    datasets: [FEE_ITEMS_DATASET],
  },
  FEE_RECEIPT: {
    label: 'Fee Receipt', pageSizeIds: ['A4P', 'A4P_HALF_TOP', 'A4P_HALF_BOTTOM'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Receipt', fields: ['receipt_no', 'invoice_no', 'invoice_date', 'payment_method'] },
      SCHOOL_TOKENS,
    ],
    datasets: [FEE_ITEMS_DATASET],
  },
  MARKSHEET: {
    label: 'Mark Sheet', pageSizeIds: ['A4P'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Exam', fields: ['exam_name', 'academic_year', 'issue_date'] },
      SCHOOL_TOKENS,
    ],
    datasets: [MARKS_DATASET],
  },
  ID_CARD: {
    label: 'ID Card', pageSizeIds: ['CR80'], pageCount: 2,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Staff', fields: ['staff_name', 'staff_id', 'designation'] },
      { source: 'Session', fields: ['academic_year', 'issue_date'] },
      SCHOOL_TOKENS,
    ],
    datasets: [],
  },
  CERTIFICATE: {
    label: 'Certificate', pageSizeIds: ['A4L', 'A4P'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Certificate', fields: ['event_name', 'issue_date', 'academic_year'] },
      SCHOOL_TOKENS,
    ],
    datasets: [],
  },
}

export function sampleDocumentData(category: DocumentCategory): DocumentData {
  const dataset = CATEGORY_CONFIG[category].datasets[0]
  return {
    category,
    tokens: { ...SAMPLE_TOKENS },
    rows: dataset ? dataset.sampleRows.map((row) => ({ ...row })) : [],
    images: { 'institute-logo': null, 'student-photo': null, 'staff-photo': null },
    status: SAMPLE_TOKENS.payment_status,
  }
}

/** Phase 1 live adapter: a real invoice (+ optional payment for receipts) → DocumentData. */
export function invoiceToDocumentData(
  invoice: Invoice,
  branding: InstituteBranding,
  payment?: Payment,
): DocumentData {
  const category: DocumentCategory = payment ? 'FEE_RECEIPT' : 'FEE_INVOICE'
  // Blank-by-default: tokens a real document can't supply must NEVER fall back to
  // sample values — fabricated data on a printed financial document.
  const tokens: Record<string, string> = {}
  for (const group of CATEGORY_CONFIG[category].tokenGroups) {
    for (const field of group.fields) tokens[field] = ''
  }
  Object.assign(tokens, {
    student_name: invoice.studentName,
    student_id: invoice.admissionNumber,
    class_section: invoice.className,
    invoice_no: invoice.invoiceNumber,
    invoice_date: invoice.issueDate ?? '',
    due_date: invoice.dueDate,
    payment_status: invoice.status.replace('_', ' '),
    receipt_no: payment?.receiptNumber ?? '',
    payment_method: payment?.method ?? '',
    school_name: branding.name,
  })
  const rows = invoice.lineItems.map((item, index) => {
    const qty = Number(item.qty) || 1
    const rate = Number(item.amount) || 0
    return { c1: item.description, c2: item.period, c3: qty, c4: rate, c6: qty * rate, id: `row${index}` }
  })
  return {
    category,
    tokens,
    rows,
    images: { 'institute-logo': branding.logoUrl, 'student-photo': null, 'staff-photo': null },
    status: invoice.status,
  }
}
