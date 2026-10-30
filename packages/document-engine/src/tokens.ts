/**
 * Token Interpolation Engine & Canonical Merge Fields Catalog
 *
 * Implements dot notation, fallbacks, conditionals, bidirectional legacy alias mapping,
 * and XSS-safe HTML escaping for document templates.
 */

export interface MergeFieldDefinition {
  id: string              // Canonical dot-notation token ID (e.g., 'student.full_name')
  label: string           // Human-readable title (e.g., 'Student Full Name')
  category: 'Institute' | 'Student' | 'Exam' | 'Finance' | 'Certificate' | 'System'
  description?: string    // Explanatory tooltip
  fallback: string        // Default mock value for studio preview
  dataType?: 'string' | 'number' | 'date' | 'currency' | 'image_url' | 'url'
  aliases?: string[]      // Backwards-compatible legacy token aliases
}

export const DOCUMENT_MERGE_FIELDS: MergeFieldDefinition[] = [
  // Institute
  {
    id: 'school.name',
    label: 'Institute / School Name',
    category: 'Institute',
    description: 'Full registered name of the educational institution',
    fallback: 'Delhi Public School',
    dataType: 'string',
    aliases: ['school_name'],
  },
  {
    id: 'school.code',
    label: 'School / Branch Code',
    category: 'Institute',
    description: 'Unique institutional branch code',
    fallback: 'DPS-DEL-01',
    dataType: 'string',
    aliases: ['school_code'],
  },
  {
    id: 'school.address',
    label: 'Institute Address',
    category: 'Institute',
    description: 'Official postal address of the institute',
    fallback: 'Sector 4, R.K. Puram, New Delhi 110022',
    dataType: 'string',
    aliases: ['school_address'],
  },
  {
    id: 'school.affiliation_no',
    label: 'Affiliation / Registration No',
    category: 'Institute',
    description: 'Board affiliation or government registration number',
    fallback: 'CBSE/AFF/2026/04',
    dataType: 'string',
    aliases: ['affiliation_code', 'school_gstin'],
  },
  {
    id: 'school.logo_url',
    label: 'School Logo URL',
    category: 'Institute',
    description: 'URL of the institute logo image',
    fallback: 'https://campusone.in/assets/dps-logo.png',
    dataType: 'image_url',
    aliases: ['school_logo', 'logo_url'],
  },
  {
    id: 'school.phone',
    label: 'Primary Contact Phone',
    category: 'Institute',
    description: 'Official telephone or helpline number',
    fallback: '+91 11 2617 0000',
    dataType: 'string',
    aliases: ['school_phone'],
  },
  {
    id: 'school.email',
    label: 'Primary Contact Email',
    category: 'Institute',
    description: 'Official administration email address',
    fallback: 'admin@dpsrkp.net',
    dataType: 'string',
    aliases: ['school_email'],
  },

  // Student
  {
    id: 'student.first_name',
    label: 'First Name',
    category: 'Student',
    description: "Student's legal first name",
    fallback: 'Aarav',
    dataType: 'string',
    aliases: ['first_name'],
  },
  {
    id: 'student.last_name',
    label: 'Last Name',
    category: 'Student',
    description: "Student's family name / surname",
    fallback: 'Sharma',
    dataType: 'string',
    aliases: ['last_name'],
  },
  {
    id: 'student.full_name',
    label: 'Student Full Name',
    category: 'Student',
    description: 'Complete student name as recorded on official records',
    fallback: 'Aarav Sharma',
    dataType: 'string',
    aliases: ['student_name'],
  },
  {
    id: 'student.admission_no',
    label: 'Admission / Student ID',
    category: 'Student',
    description: 'Unique permanent student admission number',
    fallback: 'STU-2026-089',
    dataType: 'string',
    aliases: ['student_id', 'admission_no'],
  },
  {
    id: 'student.roll_no',
    label: 'Roll Number',
    category: 'Student',
    description: 'Class roll number assigned for the current session',
    fallback: '24',
    dataType: 'string',
    aliases: ['roll_no', 'roll_number'],
  },
  {
    id: 'student.class',
    label: 'Class / Grade',
    category: 'Student',
    description: 'Current academic grade or standard',
    fallback: 'Class X',
    dataType: 'string',
    aliases: ['class_name', 'class', 'class_section'],
  },
  {
    id: 'student.section',
    label: 'Section',
    category: 'Student',
    description: 'Division or section within the class',
    fallback: 'A',
    dataType: 'string',
    aliases: ['section_name', 'section'],
  },
  {
    id: 'student.dob',
    label: 'Date of Birth',
    category: 'Student',
    description: "Student's date of birth",
    fallback: '15 Aug 2010',
    dataType: 'date',
    aliases: ['date_of_birth', 'dob'],
  },
  {
    id: 'student.gender',
    label: 'Gender',
    category: 'Student',
    description: 'Student gender designation',
    fallback: 'Male',
    dataType: 'string',
    aliases: ['gender'],
  },
  {
    id: 'student.father_name',
    label: 'Father / Guardian Name',
    category: 'Student',
    description: 'Full name of father or legal guardian',
    fallback: 'Rajesh Sharma',
    dataType: 'string',
    aliases: ['guardian_name', 'father_name'],
  },
  {
    id: 'student.mother_name',
    label: 'Mother Name',
    category: 'Student',
    description: 'Full name of mother',
    fallback: 'Sunita Sharma',
    dataType: 'string',
    aliases: ['mother_name'],
  },
  {
    id: 'student.address',
    label: 'Residential Address',
    category: 'Student',
    description: "Student's primary home address",
    fallback: 'Flat 402, Green Valley Apts, New Delhi',
    dataType: 'string',
    aliases: ['student_address'],
  },
  {
    id: 'student.photo_url',
    label: 'Student Photo URL',
    category: 'Student',
    description: 'URL of the student profile/ID photograph',
    fallback: 'https://campusone.in/assets/student-aarav.jpg',
    dataType: 'image_url',
    aliases: ['student_photo', 'photo_url'],
  },

  // Exam
  {
    id: 'exam.name',
    label: 'Examination Name',
    category: 'Exam',
    description: 'Title of the evaluation or exam cycle',
    fallback: 'Mid-Term Assessment 2026',
    dataType: 'string',
    aliases: ['exam_name'],
  },
  {
    id: 'exam.term',
    label: 'Examination Term',
    category: 'Exam',
    description: 'Academic term (Term 1, Term 2, etc.)',
    fallback: 'Term 1',
    dataType: 'string',
    aliases: ['exam_term'],
  },
  {
    id: 'exam.session',
    label: 'Academic Session / Year',
    category: 'Exam',
    description: 'Academic year duration',
    fallback: '2026–2027',
    dataType: 'string',
    aliases: ['academic_year'],
  },
  {
    id: 'exam.start_date',
    label: 'Exam Start Date',
    category: 'Exam',
    description: 'Commencement date of the exam series',
    fallback: '12 Oct 2026',
    dataType: 'date',
    aliases: ['exam_start_date'],
  },
  {
    id: 'exam.end_date',
    label: 'Exam End Date',
    category: 'Exam',
    description: 'Concluding date of the exam series',
    fallback: '24 Oct 2026',
    dataType: 'date',
    aliases: ['exam_end_date'],
  },

  // Finance
  {
    id: 'receipt.number',
    label: 'Fee Receipt / Invoice Number',
    category: 'Finance',
    description: 'Unique fee receipt or transaction identifier',
    fallback: 'REC-2026-0189',
    dataType: 'string',
    aliases: ['receipt_no', 'receipt_number', 'invoice_no'],
  },
  {
    id: 'receipt.date',
    label: 'Receipt / Payment Date',
    category: 'Finance',
    description: 'Date payment was received or invoiced',
    fallback: '15 Oct 2026',
    dataType: 'date',
    aliases: ['receipt_date', 'payment_date', 'invoice_date'],
  },
  {
    id: 'receipt.amount',
    label: 'Total Amount Paid',
    category: 'Finance',
    description: 'Total fee currency amount',
    fallback: '₹45,000.00',
    dataType: 'currency',
    aliases: ['amount', 'total_amount', 'fee_amount'],
  },
  {
    id: 'receipt.payment_mode',
    label: 'Payment Method / Mode',
    category: 'Finance',
    description: 'Mode of payment (UPI, NetBanking, Cash, Cheque)',
    fallback: 'UPI / NetBanking',
    dataType: 'string',
    aliases: ['payment_method', 'payment_mode'],
  },
  {
    id: 'receipt.fee_head',
    label: 'Fee Head Description',
    category: 'Finance',
    description: 'Categorization of fees charged',
    fallback: 'Tuition & Lab Fee',
    dataType: 'string',
    aliases: ['fee_head'],
  },

  // Certificate
  {
    id: 'certificate.number',
    label: 'Certificate Serial Number',
    category: 'Certificate',
    description: 'Official verifiable certificate identification number',
    fallback: 'CERT-2026-9812',
    dataType: 'string',
    aliases: ['cert_no', 'certificate_no'],
  },
  {
    id: 'certificate.issue_date',
    label: 'Certificate Issue Date',
    category: 'Certificate',
    description: 'Date certificate was formally issued',
    fallback: '30 Oct 2026',
    dataType: 'date',
    aliases: ['issue_date'],
  },
  {
    id: 'certificate.qr_code',
    label: 'Verification QR Code Data',
    category: 'Certificate',
    description: 'Public cryptographic validation payload for QR code',
    fallback: 'https://campusone.in/verify/CERT-2026-9812',
    dataType: 'url',
    aliases: ['qr_code', 'verification_qr'],
  },
  {
    id: 'certificate.verification_url',
    label: 'Public Verification URL',
    category: 'Certificate',
    description: 'URL allowing public verification of the document',
    fallback: 'https://campusone.in/verify/CERT-2026-9812',
    dataType: 'url',
    aliases: ['qr_verify_url', 'verification_url'],
  },

  // System
  {
    id: 'current_date',
    label: "Today's Date",
    category: 'System',
    description: 'Current document generation date',
    fallback: '30 Oct 2026',
    dataType: 'date',
    aliases: ['today'],
  },
  {
    id: 'page_number',
    label: 'Current Page Number',
    category: 'System',
    description: 'Dynamically computed 1-based page index',
    fallback: '1',
    dataType: 'number',
    aliases: ['page_no'],
  },
  {
    id: 'total_pages',
    label: 'Total Page Count',
    category: 'System',
    description: 'Total number of pages in the rendered document',
    fallback: '1',
    dataType: 'number',
    aliases: ['page_count'],
  },
]

export const MERGE_FIELD_CATALOG = DOCUMENT_MERGE_FIELDS

// Build bidirectional alias lookup dictionary
const ALIAS_MAP = new Map<string, string[]>()
for (const field of DOCUMENT_MERGE_FIELDS) {
  const allKeys = [field.id, ...(field.aliases || [])]
  for (const k of allKeys) {
    ALIAS_MAP.set(k, allKeys)
  }
}

/**
 * Escapes characters that have special meaning in HTML.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Traverses a nested object by dot notation path (e.g. `student.full_name`).
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return undefined
  }
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      FORBIDDEN_PROPERTIES.has(part) ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Resolves a field path from a dataset, checking:
 * 1. Exact direct key match in `data[path]`
 * 2. Nested traversal `data.a.b`
 * 3. Bidirectional alias mappings across all synonyms
 */
export function resolvePathValue(data: Record<string, unknown>, path: string): unknown {
  if (!data || FORBIDDEN_PROPERTIES.has(path)) return undefined

  // 1. Exact key match on flat dictionary
  if (Object.prototype.hasOwnProperty.call(data, path) && data[path] !== undefined) {
    return data[path]
  }

  // 2. Nested dot navigation
  if (path.includes('.')) {
    const nested = getNestedValue(data, path)
    if (nested !== undefined) {
      return nested
    }
  }

  // 3. Bidirectional aliases
  const synonyms = ALIAS_MAP.get(path) || []
  for (const synonym of synonyms) {
    if (synonym === path || FORBIDDEN_PROPERTIES.has(synonym)) continue
    if (Object.prototype.hasOwnProperty.call(data, synonym) && data[synonym] !== undefined) {
      return data[synonym]
    }
    if (synonym.includes('.')) {
      const nested = getNestedValue(data, synonym)
      if (nested !== undefined) {
        return nested
      }
    }
  }

  return undefined
}

export interface InterpolationOptions {
  escapeHtml?: boolean           // Default: false
  highlightTokens?: boolean      // Default: false (wrap in <span class="doc-tk">)
  sampleMode?: boolean           // Default: true (resolve values; false preserves {{token}})
  keepUnresolvedTokens?: boolean // Default: false (unknown token -> '' or fallback)
}

/**
 * Evaluates whether a value is considered truthy in conditional `#if` blocks.
 * Note: Number 0 is truthy (e.g., student roll_no = 0 or marks = 0).
 */
export function isTruthy(val: unknown): boolean {
  if (val === null || val === undefined || val === false) return false
  if (typeof val === 'string') return val.trim().length > 0
  if (Array.isArray(val)) return val.length > 0
  return true
}

/**
 * Resolves conditional blocks with support for arbitrary nesting and else branches
 * using a balanced-delimiter recursive scanner.
 */
export function resolveConditionals(
  template: string,
  data: Record<string, unknown> = {},
): string {
  const ifOpenRegex = /\{\{#if\s+([a-zA-Z0-9_.-]+)\s*\}\}/g
  let result = ''
  let cursor = 0

  while (cursor < template.length) {
    ifOpenRegex.lastIndex = cursor
    const openMatch = ifOpenRegex.exec(template)
    if (!openMatch) {
      result += template.slice(cursor)
      break
    }

    result += template.slice(cursor, openMatch.index)
    const conditionPath = openMatch[1].trim()
    const contentStartIndex = openMatch.index + openMatch[0].length

    // Scan for matching {{/if}} and optional {{else}} at depth 1
    const tagRegex = /\{\{#if\s+[a-zA-Z0-9_.-]+\s*\}\}|\{\{\s*else\s*\}\}|\{\{\s*\/if\s*\}\}/g
    tagRegex.lastIndex = contentStartIndex
    let depth = 1
    let elseIndex = -1
    let elseContentStartIndex = -1
    let closeTagStartIndex = -1
    let closeTagEndIndex = -1

    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagRegex.exec(template)) !== null) {
      const tag = tagMatch[0]
      if (tag.startsWith('{{#if')) {
        depth++
      } else if (/^\{\{\s*else\s*\}\}$/.test(tag)) {
        if (depth === 1 && elseIndex === -1) {
          elseIndex = tagMatch.index
          elseContentStartIndex = tagMatch.index + tag.length
        }
      } else if (/^\{\{\s*\/if\s*\}\}$/.test(tag)) {
        depth--
        if (depth === 0) {
          closeTagStartIndex = tagMatch.index
          closeTagEndIndex = tagMatch.index + tag.length
          break
        }
      }
    }

    if (depth !== 0) {
      // Unclosed {{#if}}, leave unparsed from openMatch.index
      result += template.slice(openMatch.index)
      break
    }

    let thenBlock: string
    let elseBlock: string | undefined
    if (elseIndex !== -1) {
      thenBlock = template.slice(contentStartIndex, elseIndex)
      elseBlock = template.slice(elseContentStartIndex, closeTagStartIndex)
    } else {
      thenBlock = template.slice(contentStartIndex, closeTagStartIndex)
      elseBlock = undefined
    }

    const val = resolvePathValue(data, conditionPath)
    const chosenBlock = isTruthy(val) ? thenBlock : (elseBlock ?? '')
    result += resolveConditionals(chosenBlock, data)

    cursor = closeTagEndIndex
  }

  return result
}

/**
 * Interpolates variables, fallbacks, and conditional blocks in a template string.
 *
 * Supported syntax:
 * - `{{student.full_name}}`
 * - `{{student.roll_no | "N/A"}}`
 * - `{{#if student.section}}Sec: {{student.section}}{{else}}No Section{{/if}}`
 * - `{{#if student.section}}Sec: {{student.section}}{{/if}}`
 */
export function interpolateTokens(
  template: string,
  data: Record<string, unknown> = {},
  options: InterpolationOptions = {},
): string {
  if (!template || typeof template !== 'string') return ''

  const {
    escapeHtml: shouldEscape = false,
    sampleMode = true,
    keepUnresolvedTokens = false,
  } = options

  if (!sampleMode) {
    return template
  }

  // 1. Process conditional blocks with balanced delimiter recursion
  const processed = resolveConditionals(template, data)

  // Process variable tokens: {{ path }} or {{ path | "fallback" }}
  const tokenRegex = /\{\{\s*([a-zA-Z0-9_.-]+)(?:\s*\|\s*(?:"([^"]*)"|'([^']*)'|([^}]+)))?\s*\}\}/g

  return processed.replace(tokenRegex, (fullMatch, rawPath: string, qFallback?: string, sqFallback?: string, unqFallback?: string) => {
    const path = rawPath.trim()
    const fallback = (qFallback ?? sqFallback ?? unqFallback ?? '').trim()
    const rawValue = resolvePathValue(data, path)

    // Check if rawValue is defined (null or undefined or empty string triggers fallback)
    let finalValue: string
    if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      finalValue = String(rawValue)
    } else if (fallback !== '') {
      finalValue = fallback
    } else if (keepUnresolvedTokens) {
      return fullMatch
    } else {
      finalValue = ''
    }

    if (shouldEscape) {
      return escapeHtml(finalValue)
    }
    return finalValue
  })
}

/**
 * Extracts all unique token keys referenced in a template string.
 */
export function extractTokens(template: string): string[] {
  if (!template || typeof template !== 'string') return []

  const tokens = new Set<string>()

  // Conditionals: {{#if path}}
  const ifRegex = /\{\{#if\s+([a-zA-Z0-9_.-]+)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = ifRegex.exec(template)) !== null) {
    tokens.add(match[1].trim())
  }

  // Variables: {{ path | ... }}
  const tokenRegex = /\{\{\s*([a-zA-Z0-9_.-]+)(?:\s*\|[\s\S]*?)?\}\}/g
  while ((match = tokenRegex.exec(template)) !== null) {
    const token = match[1].trim()
    if (token !== '#if' && token !== 'else' && token !== '/if') {
      tokens.add(token)
    }
  }

  return Array.from(tokens)
}
