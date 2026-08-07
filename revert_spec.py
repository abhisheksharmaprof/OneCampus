import re

file_path = r"E:\CampusOne\institute-admin-screens-spec.md"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r"(### 11\.2 Timetable tab\n.*?)(?=### 11\.3 Exam Schedule tab)"

replacement = """### 11.2 Timetable tab
This is the core generation and edit view.
- **Top Controls:** Class selection dropdown (required before generation). "Regenerate" button becomes clickable only after a class is selected.
- **Bulk Action:** Separate button for "Regenerate for all classes" with a confirmation dialog: "This will regenerate X class timetables and may overwrite manual edits. Continue?".
- **View Toggle:** A segmented control for "Grid View" vs "Class List View".
  - **Class List View:** Table showing every class with status badge (Not generated / Draft / Published), last-generated date, and conflict count.
- **Grid Views:** Toggle between "By class", "By teacher", and **"By room"** (for shared spaces like science lab).
  - **Substitute-teacher suggestions:** If a teacher has approved leave (from `leave_applications`), their scheduled periods show a visual flag. Clicking it suggests available substitutes (same subject expertise or simply "free at this period").
  - **Pre-publish constraint report:** Before publishing, shows a summary modal catching under- or over-scheduled subjects/teachers (e.g. "Mathematics scheduled 5/6 required periods").
- **Manual-edit validation:** When dragging/assigning, invalid actions are rejected with a specific, named error message in a Toast/Modal. Example: "Can't assign Aarav Sharma to Period 6 (12:00-12:40 PM). Aarav is only available Periods 1-4. [Update Aarav's availability in Staff ->] or [Choose a different teacher]".
- **Draft -> Published lifecycle:** Generation produces a "Draft" status. An explicit "Publish" action per class (or bulk) transitions it to Published. Once Published, it surfaces in the teacher's login and parent/student login (triggers `timetable_published` notification).
- **Edit after generation:** Manually editing a Published timetable re-enters "Draft" state for that class, so parents/teachers do not see mid-edit states. Lock icons on cells preserve locked periods during regeneration.
- **Version history:** Ability to revert a class timetable to the last few generated/edited versions.
- **Effective-dated timetables:** Support mid-term changes via an "effective from" date.
- **Export:** Export per class as a formatted PDF for printing.

"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Spec reverted successfully")
