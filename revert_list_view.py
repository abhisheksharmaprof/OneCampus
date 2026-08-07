import re

file_path = r"E:\CampusOne\apps\institute-admin-web\src\features\timetable\TimetableGenerator.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove TimetableListView and new TimetableTab
list_view_pattern = r'function TimetableListView.*?(?=const gridHeadStyle =)'
content = re.sub(list_view_pattern, '', content, flags=re.DOTALL)

# 2. Revert TimetableDetailView back to TimetableTab
content = content.replace("function TimetableDetailView({ classId, onBack, bundle, updateBundle }) {", "function TimetableTab({ bundle, updateBundle }) {")

# 3. Revert useState(classId) back to useState("")
content = content.replace('const [generateScope, setGenerateScope] = useState(classId);', 'const [generateScope, setGenerateScope] = useState("");')

# 4. Remove the injected Back button and action bar from TimetableTab
back_button_pattern = r'return \(\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: 16 \}\}>\s*<div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid \$\{COLORS\.border\}` \}\}>\s*<button onClick=\{onBack\}[^>]*>\s*&larr; Back to all classes\s*</button>\s*<div style=\{\{ display: "flex", gap: 12, alignItems: "center" \}\}>\s*<span[^>]*>Unsaved changes</span>\s*<Button variant="ghost" size="sm">Save draft</Button>\s*<Button variant="primary" size="sm">Publish</Button>\s*</div>\s*</div>\s*<Card>'

replacement = """return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>"""

content = re.sub(back_button_pattern, replacement, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Reverted TimetableGenerator.jsx")
