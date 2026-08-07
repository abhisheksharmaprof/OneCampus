import re

file_path = r"E:\CampusOne\institute-admin-screens-spec.md"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r"(### 11\.2 Timetable tab\n.*?)(?=### 11\.3 Exam Schedule tab)"

replacement = """### 11.2 Timetable tab
Replaced by a list/dashboard paradigm: a list page showing status of all classes, leading to a detail view for individual grids.

**Timetables List Page:**
- **Primary action:** Top-right "+ Generate timetable" button. Opens a class-selection step (single, multiple, or a distinct "All Classes" option with a confirmation dialog) instead of having generation controls embedded in the page.
- **Header summary strip:** At a glance status (e.g., "18 of 24 classes published · 4 in draft · 2 not started").
- **Filter Bar:** By branch, by grade/class, and by status.
- **Bulk actions:** Checkbox per row for "Publish selected" and "Regenerate selected".
- **Data Table columns:**
  - **Class:** e.g., "Class 8 - A", clickable link to detail view.
  - **Status:** Badge (Not started [gray] / Draft [amber] / Published [green]).
  - **Last generated/edited:** Timestamp plus actor (e.g., "Generated 2 days ago by Admin").
  - **Conflicts:** Small red count badge if unresolved issues exist (e.g., empty periods, teacher over limit).
  - **Actions:** View, Edit, and overflow (⋮) for Regenerate, Publish/Unpublish, Export PDF, Export CSV.

**Class Detail View:**
- **Persistent action bar:** Stays visible on scroll. Contains: "Save draft", "Publish" (or "Publish changes" if already live), "Regenerate this class", "Export". 
- **Explicit Save:** "Save draft" is required to commit changes. Autosave is disabled to prevent half-finished edits going live. Unsaved changes trigger an "Unsaved changes" indicator and a navigation-away warning ("Save draft / Discard / Cancel").
- **Publish action:** Separate from save. Explicit confirmation required ("Publish Class 8-A's timetable? Teachers and parents will be able to see it immediately."). Publishing fires the `timetable_published` notification to parents and assigned teachers.
- **Version history:** Small "History" link near action bar. Shows previous saves/publishes with actor timestamp and "Restore this version" capability.
- **Grid View features:**
  - **Grid Views:** Toggle between "By class", "By teacher", and **"By room"** (for shared spaces like science lab).
  - **Substitute-teacher suggestions:** If a teacher has approved leave (from `leave_applications`), their scheduled periods show a visual flag. Clicking it suggests available substitutes (same subject expertise or simply "free at this period").
  - **Pre-publish constraint report:** Before publishing, shows a summary modal catching under- or over-scheduled subjects/teachers (e.g. "Mathematics scheduled 5/6 required periods").
  - **Manual-edit validation:** When dragging/assigning, invalid actions are rejected with a specific, named error message in a Toast/Modal. Example: "Can't assign Aarav Sharma to Period 6 (12:00-12:40 PM). Aarav is only available Periods 1-4. [Update Aarav's availability in Staff ->] or [Choose a different teacher]".
  - **Effective-dated timetables:** Support mid-term changes via an "effective from" date.

"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Spec updated successfully")
