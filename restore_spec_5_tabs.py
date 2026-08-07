import re

file_path = r"E:\CampusOne\institute-admin-screens-spec.md"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'\*\(Note: "Teachers", "Structure", and "Assignments" tabs have been removed\..*?(?=### 11\.3 Exam Schedule tab)'

replacement = """### 11.2 Teachers tab
A simple data table defining teacher availability (since the timetable needs to know *who* can teach *when*).
- **Columns:** Name, Weekly Max Periods, Daily Max Periods, Working Days, `...` (Edit/Delete).
- **Primary Button:** "+ Add Teacher". Modal captures basic constraints.

### 11.3 Structure tab
A grid where an Admin defines what subjects each class *must* take per week.
- **Columns:** Class (e.g., 10-A), Subject, Periods/Week, Double Periods (Yes/No), Requires Room (e.g., Science Lab).
- **Primary Button:** "+ Add Subject Requirement".

### 11.4 Assignments tab
Linking teachers to the structure.
- **Columns:** Class, Subject, Assigned Teacher.
- **Validation:** Cannot assign a teacher to a subject if it exceeds their weekly max periods.

### 11.5 Timetable tab
This is the core generation and edit view.
- **Top Controls:** "Generate" button, View Toggle (By Class / By Teacher).
- **Grid View:** A standard 2D grid (Days on Y-axis, Periods on X-axis).
- **Drag-and-Drop:** Ability to manually drag a scheduled block to an empty slot or swap it with another block.
- **Export:** Export as PDF/CSV.

"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Restored original 5 tabs in spec")
