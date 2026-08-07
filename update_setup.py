import re

file_path = r"E:\CampusOne\apps\institute-admin-web\src\features\timetable\TimetableGenerator.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update generateScope initial state
content = content.replace('useState("all");', 'useState("");')

# 2. Update the Select dropdown and buttons for generation
generate_pattern = r'<Select value=\{generateScope\} onChange=\{\(e\) => setGenerateScope\(e\.target\.value\)\} style=\{\{ minWidth: 150 \}\}>\s*<option value="all">All Classes</option>\s*\{bundle\.classes\.map\(c => <option key=\{c\.id\} value=\{c\.id\}>\{c\.name\}</option>\)\}\s*</Select>\s*<Button variant="accent" icon=\{generating \? Loader2 : Sparkles\} onClick=\{runGenerate\} disabled=\{generating\}>\s*\{generating \? "Generating\." : result \? "Regenerate" : "Generate timetable"\}\s*</Button>'

new_generate = """<Select value={generateScope} onChange={(e) => setGenerateScope(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">Select a class...</option>
              {bundle.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button variant="accent" icon={generating ? Loader2 : Sparkles} onClick={runGenerate} disabled={generating || !generateScope}>
              {generating ? "Generating." : result ? "Regenerate" : "Generate timetable"}
            </Button>
            <Button variant="ghost" onClick={() => {
              if(window.confirm("This will regenerate all class timetables and may overwrite manual edits. Continue?")) {
                const oldScope = generateScope;
                setGenerateScope("all");
                setTimeout(() => { runGenerate(); setGenerateScope(oldScope); }, 0);
              }
            }}>
              Regenerate for all classes
            </Button>"""

content = re.sub(generate_pattern, new_generate, content, flags=re.DOTALL)

# 3. Add Subject scheduling rules to SetupTab
setup_end_pattern = r'</Card>\s*\{onLoadSample && <Card style=\{\{ background: COLORS\.accentSoft, border: `1px solid \$\{COLORS\.accent\}22` \}\}>'

subject_rules_card = """</Card>

      <Card>
        <SectionTitle step="3" title="Subject scheduling rules" subtitle="Subject names pulled live from Academic Structure. Set their timetable constraints here." />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {bundle.subjects.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked={!!s.isDouble} onChange={(e) => {
                  const updatedSubjects = bundle.subjects.map(sub => sub.id === s.id ? {...sub, isDouble: e.target.checked} : sub);
                  updateBundle({...bundle, subjects: updatedSubjects});
                }}/> Needs double period</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked={!!s.allowTwicePerDay} onChange={(e) => {
                  const updatedSubjects = bundle.subjects.map(sub => sub.id === s.id ? {...sub, allowTwicePerDay: e.target.checked} : sub);
                  updateBundle({...bundle, subjects: updatedSubjects});
                }}/> Allow twice per day</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <span>Requires room:</span>
                  <Select value={s.requiresRoomId || ""} onChange={(e) => {
                    const updatedSubjects = bundle.subjects.map(sub => sub.id === s.id ? {...sub, requiresRoomId: e.target.value} : sub);
                    updateBundle({...bundle, subjects: updatedSubjects});
                  }}>
                    <option value="">None (Any classroom)</option>
                    {bundle.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </div>
              </div>
            </div>
          ))}
          {bundle.subjects.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkMuted }}>No subjects found. Add them in Academic Structure.</div>}
        </div>
      </Card>

      {onLoadSample && <Card style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}22` }}>"""

content = re.sub(setup_end_pattern, subject_rules_card, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Setup updated successfully")
