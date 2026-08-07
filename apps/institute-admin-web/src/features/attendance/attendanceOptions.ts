export interface AttendanceClassOption {
  id: string
  name: string
  displayName?: string
}

export interface AttendanceSectionOption {
  id: string
  gradeId: string
  sectionName: string
}

type RawClass = { id: string; name?: string }
type RawSection = {
  id: string
  gradeId?: string
  grade?: { id?: string; name?: string } | null
  sectionName?: string
}

export function normalizeSections(items: RawSection[] | undefined): AttendanceSectionOption[] {
  return (items ?? [])
    .map((item) => ({
      id: item.id,
      gradeId: item.gradeId ?? item.grade?.id ?? '',
      sectionName: item.sectionName ?? 'All Students',
    }))
    .filter((item) => item.id && item.gradeId)
}

export function labelDuplicateClasses(classes: RawClass[] | undefined, sections: AttendanceSectionOption[]): AttendanceClassOption[] {
  const normalized = (classes ?? []).map((item) => ({ id: item.id, name: item.name?.trim() || 'Unnamed class' }))
  const nameCounts = new Map<string, number>()
  normalized.forEach((item) => nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1))

  return normalized.map((item) => {
    if ((nameCounts.get(item.name) ?? 0) < 2) return item
    const sectionLabels = sections.filter((section) => section.gradeId === item.id).map((section) => section.sectionName)
    const suffix = sectionLabels.length ? ` · ${sectionLabels.join(', ')}` : ''
    return { ...item, displayName: `${item.name}${suffix}` }
  })
}
