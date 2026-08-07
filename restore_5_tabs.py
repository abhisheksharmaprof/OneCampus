import re

file_path = r"E:\CampusOne\apps\institute-admin-web\src\features\timetable\TimetableGenerator.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Restore TABS array
tabs_pattern = r"const TABS = \[\s*\{\s*id:\s*\"setup\"[^\n]*\n\s*\{\s*id:\s*\"timetable\"[^\n]*\n\s*\];"
new_tabs = """const TABS = [
  { id: "setup", label: "Setup", icon: Calendar },
  { id: "teachers", label: "Teachers", icon: Users },
  { id: "structure", label: "Structure", icon: BookOpen },
  { id: "assignments", label: "Assignments", icon: ClipboardList },
  { id: "import", label: "Import", icon: UploadCloud },
  { id: "timetable", label: "Timetable", icon: Grid3x3 },
];"""
content = re.sub(tabs_pattern, new_tabs, content, flags=re.DOTALL)

# 2. Restore render blocks in TimetableApp
# In TimetableApp:
app_render_pattern = r'\{tab === "setup" && <SetupTab bundle=\{bundle\} updateBundle=\{persist\} onLoadSample=\{\(\) => persist\(sampleBundle\(\)\)\} />\}\s*\{tab === "timetable" && <TimetableTab bundle=\{bundle\} updateBundle=\{persist\} />\}'
new_app_render = """{tab === "setup" && <SetupTab bundle={bundle} updateBundle={persist} onLoadSample={() => persist(sampleBundle())} />}
        {tab === "teachers" && <TeachersTab bundle={bundle} updateBundle={persist} />}
        {tab === "structure" && <StructureTab bundle={bundle} updateBundle={persist} />}
        {tab === "assignments" && <AssignmentsTab bundle={bundle} updateBundle={persist} />}
        {tab === "timetable" && <TimetableTab bundle={bundle} updateBundle={persist} />}"""
content = re.sub(app_render_pattern, new_app_render, content, flags=re.DOTALL)

# In IntegratedTimetableGenerator:
int_render_pattern = r'\{tab === "setup" && <SetupTab bundle=\{bundle\} updateBundle=\{setBundle\} onLoadSample=\{null\} />\}\s*\{tab === "timetable" && <TimetableTab bundle=\{bundle\} updateBundle=\{setBundle\} />\}'
new_int_render = """{tab === "setup" && <SetupTab bundle={bundle} updateBundle={setBundle} onLoadSample={null} />}
        {tab === "teachers" && <TeachersTab bundle={bundle} updateBundle={setBundle} />}
        {tab === "structure" && <StructureTab bundle={bundle} updateBundle={setBundle} />}
        {tab === "assignments" && <AssignmentsTab bundle={bundle} updateBundle={setBundle} />}
        {tab === "timetable" && <TimetableTab bundle={bundle} updateBundle={setBundle} />}"""
content = re.sub(int_render_pattern, new_int_render, content, flags=re.DOTALL)

# 3. Restore GenerateScope dropdown and button in TimetableTab
generate_pattern = r'<Select value=\{generateScope\} onChange=\{\(e\) => setGenerateScope\(e\.target\.value\)\} style=\{\{ minWidth: 150 \}\}>\s*<option value="">Select a class\.\.\.</option>\s*\{bundle\.classes\.map\(c => <option key=\{c\.id\} value=\{c\.id\}>\{c\.name\}</option>\)\}\s*</Select>\s*<Button variant="accent" icon=\{generating \? Loader2 : Sparkles\} onClick=\{runGenerate\} disabled=\{generating \|\| !generateScope\}>\s*\{generating \? "Generating\." : result \? "Regenerate" : "Generate timetable"\}\s*</Button>\s*<Button variant="ghost"[^>]*>\s*Regenerate for all classes\s*</Button>'

original_generate = """<Select value={generateScope} onChange={(e) => setGenerateScope(e.target.value)} style={{ minWidth: 150 }}>
              <option value="all">All Classes</option>
              {bundle.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button variant="accent" icon={generating ? Loader2 : Sparkles} onClick={runGenerate} disabled={generating}>
              {generating ? "Generating." : result ? "Regenerate" : "Generate timetable"}
            </Button>"""

content = re.sub(generate_pattern, original_generate, content, flags=re.DOTALL)

# 4. Restore initial generateScope state
content = content.replace('const [generateScope, setGenerateScope] = useState("");', 'const [generateScope, setGenerateScope] = useState("all");')

# 5. Remove Subject scheduling rules from SetupTab
setup_subject_rules_pattern = r'</Card>\s*<Card>\s*<SectionTitle step="3" title="Subject scheduling rules" subtitle="Subject names pulled live from Academic Structure\. Set their timetable constraints here\." />.*?<Card style=\{\{ background: COLORS\.accentSoft, border: `1px solid \$\{COLORS\.accent\}22` \}\}>'
setup_restore = """</Card>\n\n      {onLoadSample && <Card style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}22` }}>"""

content = re.sub(setup_subject_rules_pattern, setup_restore, content, flags=re.DOTALL)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Restored original 5 tabs in TimetableGenerator")
