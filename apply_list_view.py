import re

file_path = r"E:\CampusOne\apps\institute-admin-web\src\features\timetable\TimetableGenerator.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Rename TimetableTab to TimetableDetailView
content = content.replace("function TimetableTab({ bundle, updateBundle }) {", "function TimetableDetailView({ classId, onBack, bundle, updateBundle }) {")

# 2. Make generateScope default to classId
content = content.replace('const [generateScope, setGenerateScope] = useState("");', 'const [generateScope, setGenerateScope] = useState(classId);')

# 3. Add Back button and action bar
back_button_inject = """return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: COLORS.primary, cursor: "pointer", fontWeight: 600, padding: 0 }}>
          &larr; Back to all classes
        </button>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: COLORS.warn, fontWeight: 600 }}>Unsaved changes</span>
          <Button variant="ghost" size="sm">Save draft</Button>
          <Button variant="primary" size="sm">Publish</Button>
        </div>
      </div>
      <Card>"""
content = re.sub(r'return \(\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: 16 \}\}>\s*<Card>', back_button_inject, content)


# 4. Inject TimetableListView and TimetableTab right after TimetableDetailView
list_view_and_tab = """
function TimetableListView({ bundle, onSelectClass }) {
  const [filterClass, setFilterClass] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.inkMuted }}>
          {bundle.classes.length} classes total &middot; 0 published &middot; {bundle.classes.length > 0 ? "Some" : "0"} in draft
        </div>
        <Button variant="primary" icon={Plus} onClick={() => onSelectClass(bundle.classes[0]?.id)}>
          Generate timetable
        </Button>
      </div>
      
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
          <input 
            type="text" 
            placeholder="Search classes..." 
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            style={{ padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 6, width: 250, outline: "none" }}
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: COLORS.inkFaint, borderBottom: `2px solid ${COLORS.border}` }}>Class</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: COLORS.inkFaint, borderBottom: `2px solid ${COLORS.border}` }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: COLORS.inkFaint, borderBottom: `2px solid ${COLORS.border}` }}>Last Edited</th>
              <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: COLORS.inkFaint, borderBottom: `2px solid ${COLORS.border}` }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bundle.classes.filter(c => c.name.toLowerCase().includes(filterClass.toLowerCase())).map(c => {
              const hasDraft = bundle.lastResult?.entries?.some(e => e.classId === c.id);
              return (
              <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                  <button onClick={() => onSelectClass(c.id)} style={{ background: "none", border: "none", color: COLORS.primary, cursor: "pointer", fontWeight: 600, padding: 0 }}>
                    {c.name}
                  </button>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Badge tone={hasDraft ? "accent" : "muted"}>{hasDraft ? "Draft" : "Not started"}</Badge>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: COLORS.inkMuted }}>
                  {hasDraft ? "Recently by Admin" : "-"}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" size="sm" onClick={() => onSelectClass(c.id)}>View</Button>
                </td>
              </tr>
            )})}
            {bundle.classes.length === 0 && (
              <tr><td colSpan="4" style={{ padding: 30, textAlign: "center", color: COLORS.inkMuted }}>No classes found</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TimetableTab({ bundle, updateBundle }) {
  const [activeClassId, setActiveClassId] = useState(null);

  if (activeClassId) {
    return <TimetableDetailView classId={activeClassId} onBack={() => setActiveClassId(null)} bundle={bundle} updateBundle={updateBundle} />;
  }
  return <TimetableListView bundle={bundle} onSelectClass={setActiveClassId} />;
}
"""

content = content.replace("const gridHeadStyle =", list_view_and_tab + "\nconst gridHeadStyle =")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Applied list view refactor")
