import type { Sheet } from './results.api'
export type CellRow = Record<string, string>
export interface Mapping {
  identifier: string
  name: string
  subject: string
  score: string
  maximum: string
  status: string
  defaultComponent: string
  defaultMaximum: string
  matchBy: string
  format: string
  profile?: Record<string, string>
  wide: Record<string, string>
}
export function initialMapping(headers: string[], sheets: Sheet[]): Mapping {
  const find = (...aliases: string[]) =>
    headers.find((h) => aliases.includes(h.trim().toLowerCase())) || ''
  const wide: Record<string, string> = {}
  for (const sheet of sheets)
    for (const component of sheet.components) {
      const key = headers.find(
        (h) =>
          h.trim().toLowerCase() ===
          (component.name === 'Total'
            ? sheet.name
            : `${sheet.name} ${component.name}`
          ).toLowerCase(),
      )
      if (key) wide[key] = component.id
    }
  return {
    identifier: find('roll', 'roll no', 'roll number', 'roll_no', 'admission number'),
    name: find('name', 'student name', 'student'),
    subject: find('subject'),
    score: find('marks', 'score', 'obtained marks'),
    maximum: find('maximum', 'max marks', 'maximum marks', 'total marks'),
    status: find('status'),
    profile: {
      fatherName: find('father', 'father name', 'father’s name', 'guardian'),
      motherName: find('mother', 'mother name'),
      dob: find('dob', 'date of birth'),
      attendance: find('attendance', 'attendance %'),
      remarks: find('remarks', 'remark'),
      importedTotal: find('grand total', 'obtained total'),
    },
    defaultComponent: sheets[0]?.components[0]?.id || '',
    defaultMaximum: '',
    matchBy: find('admission number') ? 'admission' : 'roll',
    format: Object.keys(wide).length ? 'wide' : 'long',
    wide,
  }
}
export function mapImportRows(rows: CellRow[], mapping: Mapping, sheets: Sheet[]) {
  const result: {
    identifier: string
    name: string
    componentId: string
    score: string | null
    status: string
    maximum: string
    profile: Record<string, string>
  }[] = []
  const add = (row: CellRow, componentId: string, score: string) => {
    const raw = String(score ?? '').trim()
    const tag = (mapping.status ? row[mapping.status] : '').trim().toUpperCase()
    const statuses: Record<string, string> = {
      AB: 'ABSENT',
      A: 'ABSENT',
      ABSENT: 'ABSENT',
      EX: 'EXEMPT',
      EXEMPT: 'EXEMPT',
      NA: 'NOT_APPLICABLE',
      'N/A': 'NOT_APPLICABLE',
      NOT_APPLICABLE: 'NOT_APPLICABLE',
      P: 'PRESENT',
      PRESENT: 'PRESENT',
    }
    const status = statuses[tag] || statuses[raw.toUpperCase()] || tag || 'PRESENT'
    result.push({
      identifier: String(row[mapping.identifier] || '').trim(),
      name: mapping.name ? String(row[mapping.name] || '').trim() : '',
      profile: Object.fromEntries(
        Object.entries(mapping.profile || {})
          .filter(([, header]) => header)
          .map(([field, header]) => [field, String(row[header] ?? '').trim()]),
      ),
      componentId,
      score: status === 'PRESENT' ? raw : null,
      status,
      maximum: mapping.maximum ? String(row[mapping.maximum] || '').trim() : mapping.defaultMaximum,
    })
  }
  for (const row of rows) {
    if (mapping.format === 'wide') {
      for (const [header, id] of Object.entries(mapping.wide)) if (id) add(row, id, row[header])
    } else {
      const sheet = mapping.subject
        ? sheets.find(
            (s) =>
              s.name.toLowerCase() ===
              String(row[mapping.subject] || '')
                .trim()
                .toLowerCase(),
          )
        : null
      const id = mapping.subject
        ? sheet?.components.length === 1
          ? sheet.components[0].id
          : ''
        : mapping.defaultComponent
      add(row, id, row[mapping.score])
    }
  }
  return result
}
