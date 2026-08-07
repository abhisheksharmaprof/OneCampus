import re

file_path = r"E:\CampusOne\institute-admin-screens-spec.md"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update Classes tab
class_tab_pattern = r"(- \*\*Classes tab:\*\*.*?A Caption note sits above the list:.*?meaningful\.\")"
class_tab_replacement = """- **Classes tab:**
  - Primary Button becomes "+ Add Class".
  - List rendered as an **accordion list** - each row: 6-dot drag handle (left), Class Name (Body-Emphasis) which acts as an accordion trigger, `...` (Edit/Delete). Dragging updates `sort_order` live with an auto-save toast ("Order updated").
  - **Curriculum Panel (Accordion Body):** Clicking a class expands a panel showing the curriculum mapped to that class. It displays a table of mapped subjects: Subject Name, Subject Code, Periods-per-week, Core-or-elective badge, and a **Teacher** assignment dropdown (this directly writes to `subject_teacher_assignments`). Primary action within panel: "+ Add Subject to Class".
  - A Caption note sits above the list: "Classes are institute-wide - the same 'Class 8' is used at every branch so common tests and cross-branch comparisons stay meaningful.\""""

content = re.sub(class_tab_pattern, class_tab_replacement, content, flags=re.DOTALL)

# Update Timetable Section
timetable_pattern = r"(## 11\. Timetable.*?)(?=---\n\n## 12\. Gamification)"

timetable_replacement = """## 11. Timetable

**Nav path:** Timetable
**Breadcrumb:** Timetable
**Page Title:** "Timetable"
**Tabs:** **Setup | Timetable | Exam Schedule | Academic Calendar**

### 11.1 Setup tab
Three sections, all timetable-specific and genuinely non-duplicated:
1. **Working days** - Checklist for active days (e.g. Mon-Sat).
2. **Daily period structure** - Definition of period times, including marking breaks as non-teaching.
3. **Subject scheduling rules** - Subject names pulled live from Academic Structure (read-only names). Each has inline toggles: "needs a double period", "requires a specific room" (dropdown), and "allow twice per day". No create/edit/delete of the subject itself here. Shows a hint: "Subject not found? [Add it in Academic Structure ->]"

*(Note: "Teachers", "Structure", and "Assignments" tabs have been removed. Teacher availability is managed in Staff -> Edit Profile. Subject catalog is in Academic Structure. Teacher-subject assignments are managed in the Academic Structure Curriculum panel by adding a Teacher column.)*

### 11.2 Timetable tab
This is the core generation and edit view.
- **Top Controls:** Class selection dropdown (required before generation). "Regenerate" button becomes clickable only after a class is selected.
- **Bulk Action:** Separate button for "Regenerate for all classes" with a confirmation dialog: "This will regenerate X class timetables and may overwrite manual edits. Continue?".
- **View Toggle:** A segmented control for "Grid View" vs "Class List View".
  - **Class List View:** Table showing every class with status badge (Not generated / Draft / Published), last-generated date, and conflict count.
- **Grid Views:** Toggle between "By class", "By teacher", and **"By room"** (for shared spaces like science lab).
  - **Substitute-teacher suggestions:** If a teacher has approved leave (from `leave_applications`), their scheduled periods show a visual flag. Clicking it suggests available substitutes (same subject expertise or simply "free at this period").
  - **Pre-publish constraint report:** Before publishing, shows a summary modal catching under- or over-scheduled subjects/teachers (e.g. "Mathematics scheduled 5/6 required periods").
- **Manual-edit validation:** When dragging/assigning, invalid actions are rejected with a specific, named error message in a Toast/Modal. Example: "Can't assign Aarav Sharma to Period 6 (12:00–12:40 PM). Aarav is only available Periods 1–4. [Update Aarav's availability in Staff ->] or [Choose a different teacher]".
- **Draft -> Published lifecycle:** Generation produces a "Draft" status. An explicit "Publish" action per class (or bulk) transitions it to Published. Once Published, it surfaces in the teacher's login and parent/student login (triggers `timetable_published` notification).
- **Edit after generation:** Manually editing a Published timetable re-enters "Draft" state for that class, so parents/teachers do not see mid-edit states. Lock icons on cells preserve locked periods during regeneration.
- **Version history:** Ability to revert a class timetable to the last few generated/edited versions.
- **Effective-dated timetables:** Support mid-term changes via an "effective from" date.
- **Export:** Export per class as a formatted PDF for printing.

### 11.3 Exam Schedule tab
- Standard Data Table: Assessment Name, Date, Time, Branch/Room, `...` (Edit/Delete). Primary Button: "+ Add Exam Slot".

### 11.4 Academic Calendar tab
- Month-view calendar (standard month grid, 7 columns), events rendered as small colored bars on their date cell (color per event type: Holiday=gray, Exam=blue, PTM=purple, Common Test=amber - small legend beneath the calendar).
- Primary Button: "+ Add Calendar Event" -> Modal: Event Name, Type (dropdown), Date (or date range for multi-day holidays), Branch(es) scope (All/Specific).
- Month navigation (< Month Year >) centered above the grid.

"""

content = re.sub(timetable_pattern, timetable_replacement, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
