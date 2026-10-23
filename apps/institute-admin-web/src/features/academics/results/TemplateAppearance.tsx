import type { Appearance, ExamDetail } from './results.api'
const reportColumns = [
  ['serial', 'S.No'],
  ['code', 'Subject code'],
  ['maximum', 'Maximum marks'],
  ['passing', 'Passing marks'],
  ['score', 'Marks obtained'],
  ['percentage', 'Subject percentage'],
  ['grade', 'Subject grade'],
  ['gradePoint', 'Grade point'],
  ['credits', 'Credits / credit points'],
  ['classStats', 'Class average / highest'],
  ['bars', 'Score bar'],
  ['status', 'Subject result'],
  ['words', 'Marks in words'],
]
const reportSections = [
  ['total', 'Grand total'],
  ['percentage', 'Overall percentage'],
  ['gpa', 'GPA / SGPA'],
  ['grade', 'Final grade'],
  ['rank', 'Class rank'],
  ['division', 'Division'],
  ['words', 'Total in words'],
  ['graph', 'Subject graph'],
  ['remarks', 'Teacher remarks'],
  ['legend', 'Grade legend'],
  ['qr', 'Document reference QR'],
  ['watermark', 'Watermark seal'],
]
export function TemplateAppearance({
  value,
  onChange,
  detail,
  onError,
}: {
  value: Appearance
  onChange: (v: Appearance) => void
  detail: ExamDetail | null
  onError: (s: string) => void
}) {
  const set = (patch: Partial<Appearance>) => onChange({ ...value, ...patch })
  const choices = (
    label: string,
    key: 'typography' | 'frame' | 'crest',
    options: [string, string][],
    fallback: string,
  ) => (
    <label>
      {label}
      <select value={value[key] || fallback} onChange={(e) => set({ [key]: e.target.value })}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
  const defaultColumns = ['maximum', 'score', 'grade', 'status']
  const defaultSections = ['total', 'percentage', 'grade', 'remarks']
  const toggles = (key: 'columns' | 'sections', options: string[][], defaults: string[]) =>
    options.map(([id, label]) => (
      <label className="mr-check" key={id}>
        <input
          type="checkbox"
          checked={(value[key] || defaults).includes(id)}
          onChange={(e) =>
            set({
              [key]: e.target.checked
                ? [...(value[key] || defaults), id]
                : (value[key] || defaults).filter((v) => v !== id),
            })
          }
        />
        {label}
      </label>
    ))
  return (
    <details className="mr-appearance" open>
      <summary>Template designer · layout, fields & branding</summary>
      <p className="mr-muted">
        Saved with this report configuration. These controls create a custom variation without
        changing school branding or other templates.
      </p>
      <div className="mr-layout-cards">
        {[
          ['classic', 'Classic Board', 'Formal frame and school report'],
          ['modern', 'Modern Executive', 'Clean headings and score summaries'],
          ['university', 'University Transcript', 'Course codes, credits and SGPA'],
          ['royal', 'Royal Heritage', 'Ceremonial frame and crest'],
        ].map(([design, title, note]) => (
          <button
            type="button"
            className={`mr-layout-card ${value.design === design ? 'selected' : ''}`}
            key={design}
            onClick={() =>
              set({
                design,
                ...(design === 'university'
                  ? {
                      columns: [
                        'code',
                        'score',
                        'maximum',
                        'grade',
                        'gradePoint',
                        'credits',
                        'status',
                      ],
                      sections: ['total', 'percentage', 'gpa', 'grade', 'remarks', 'legend'],
                    }
                  : {}),
              })
            }
          >
            <span className={`mr-layout-swatch ${design}`}>Aa</span>
            <strong>{title}</strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <div className="mr-fields">
        <label>
          Custom brand accent
          <input
            type="color"
            value={value.accent || '#3456a6'}
            onChange={(e) => set({ accent: e.target.value })}
          />
          <button className="mr-link" type="button" onClick={() => set({ accent: '' })}>
            Use school colour
          </button>
        </label>
        {choices(
          'Typography',
          'typography',
          [
            ['sans', 'Modern sans'],
            ['serif', 'Academic serif'],
            ['mono', 'Transcript mono'],
          ],
          'sans',
        )}
        {choices(
          'Page frame',
          'frame',
          [
            ['double', 'Classic double border'],
            ['ornate', 'Ornamental inset'],
            ['solid', 'Solid frame'],
            ['minimal', 'Minimal border'],
          ],
          value.design === 'classic' || !value.design
            ? 'double'
            : value.design === 'royal'
              ? 'ornate'
              : 'minimal',
        )}
        {choices(
          'Emblem',
          'crest',
          [
            ['school', 'Existing school logo'],
            ['shield', 'Shield & torch'],
            ['laurel', 'Laurel & book'],
            ['stem', 'University STEM'],
            ['royal', 'Royal crest'],
            ['none', 'Hide logo'],
          ],
          'school',
        )}
        {(['schoolName', 'subtitle', 'address', 'session'] as const).map((key, i) => (
          <label key={key}>
            {
              [
                'Institution name override',
                'Board / affiliation subtitle',
                'Address & contact override',
                'Academic session override',
              ][i]
            }
            <input
              maxLength={key === 'address' ? 300 : 160}
              value={value[key] || ''}
              placeholder="Use existing school information"
              onChange={(e) => set({ [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Custom report logo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > 500000) {
                onError('Choose a logo smaller than 500 KB.')
                return
              }
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result).split(',')[1])
                reader.onerror = () => reject(new Error('Cannot read logo.'))
                reader.readAsDataURL(file)
              }).catch(() => null)
              if (data) set({ logo: data, crest: 'school' })
              else onError('Cannot read this logo.')
              e.target.value = ''
            }}
          />
          {value.logo && (
            <button type="button" className="mr-link" onClick={() => set({ logo: '' })}>
              Remove custom logo
            </button>
          )}
        </label>
      </div>
      <fieldset>
        <legend>Subject table columns</legend>
        <div className="mr-option-grid">{toggles('columns', reportColumns, defaultColumns)}</div>
      </fieldset>
      <fieldset>
        <legend>Summary & footer sections</legend>
        <div className="mr-option-grid">{toggles('sections', reportSections, defaultSections)}</div>
      </fieldset>
      <fieldset>
        <legend>Visible subject rows</legend>
        <p className="mr-muted">
          Hiding a row changes presentation only. Totals and pass rules still use all eligible
          subjects.
        </p>
        <div className="mr-option-grid">
          {detail?.subjects.map((s) => (
            <label className="mr-check" key={s.subjectId}>
              <input
                type="checkbox"
                checked={!value.hiddenSubjects?.includes(s.subjectId)}
                onChange={(e) =>
                  set({
                    hiddenSubjects: e.target.checked
                      ? (value.hiddenSubjects || []).filter((v) => v !== s.subjectId)
                      : [...(value.hiddenSubjects || []), s.subjectId],
                  })
                }
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  )
}
