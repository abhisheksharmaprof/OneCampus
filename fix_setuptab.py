import re

file_path = r"E:\CampusOne\apps\institute-admin-web\src\features\timetable\TimetableGenerator.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'return \(\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: 16 \}\}>\s*<div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid \$\{COLORS\.border\}` \}\}>\s*<button onClick=\{onBack\}[^>]*>\s*&larr; Back to all classes\s*</button>\s*<div style=\{\{ display: "flex", gap: 12, alignItems: "center" \}\}>\s*<span[^>]*>Unsaved changes</span>\s*<Button variant="ghost" size="sm">Save draft</Button>\s*<Button variant="primary" size="sm">Publish</Button>\s*</div>\s*</div>\s*<Card>'

replacement = """return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>"""

# Replace ONLY the FIRST occurrence!
content = re.sub(pattern, replacement, content, count=1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed SetupTab successfully")
