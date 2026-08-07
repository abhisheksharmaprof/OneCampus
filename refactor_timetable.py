import re

file_path = r"E:\CampusOne\apps\institute-admin-web\src\features\timetable\TimetableGenerator.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update TABS array
tabs_pattern = r"const TABS = \[.*?\];"
new_tabs = """const TABS = [
  { id: "setup", label: "Setup", icon: Calendar },
  { id: "timetable", label: "Timetable", icon: Grid3x3 },
];"""
content = re.sub(tabs_pattern, new_tabs, content, flags=re.DOTALL)

# 2. Update render blocks in TimetableApp
app_render_pattern = r"\{tab === \"setup\".*?\{tab === \"timetable\"[^\n]*"
new_app_render = """{tab === "setup" && <SetupTab bundle={bundle} updateBundle={persist} onLoadSample={() => persist(sampleBundle())} />}
        {tab === "timetable" && <TimetableTab bundle={bundle} updateBundle={persist} />}"""
content = re.sub(app_render_pattern, new_app_render, content, flags=re.DOTALL)

# 3. Update render blocks in IntegratedTimetableGenerator
int_render_pattern = r"\{tab === \"setup\".*?\{tab === \"timetable\"[^\n]*"
new_int_render = """{tab === "setup" && <SetupTab bundle={bundle} updateBundle={setBundle} onLoadSample={null} />}
        {tab === "timetable" && <TimetableTab bundle={bundle} updateBundle={setBundle} />}"""
# Since there are two occurrences, the previous sub might have matched both or neither correctly.
# Let's do it carefully by finding both
content = re.sub(r'\{tab === "setup".*?\{tab === "timetable".*?\} />\}', new_int_render, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
