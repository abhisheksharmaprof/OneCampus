# Institute Admin — Complete Screen & Component Specification

**Role:** Institute Admin (`user_type = 'institute_admin'`; system role "Institute Admin"; `institute_id` set, `branch_id = NULL` → full visibility across every branch of one institute)
**Purpose of this document:** A build-ready reference. Every screen lists its exact regions, every component's position/size/state, and every button's label, placement, and action — detailed enough that a designer can wireframe directly from it and a frontend engineer can build directly from it without needing to ask "where does this go?"
**Grounded in:** `school-management-crm-features.md`, `leaderboard-batches-permissions-feature-spec.md`, `school_platform_schema.sql`
**Companion docs (not in this file):** Teacher/Staff login spec, Parent login spec — to be produced separately, reusing the design system defined in Section 0 so all three roles feel like one product.

---

## Table of Contents

- 0. Design System Foundations (grid, color, type, spacing, component library)
- 1. Global Navigation Shell (top bar, sidebar, page header, list-screen pattern, responsive rules)
- 2. Dashboard
- 3. Institute Setup (Branches, Academic Structure, Branding & Profile)
- 4. Roles & Permissions (Role Builder, Assignments, Governance)
- 5. People (Staff, Students, Parents)
- 6. Admissions CRM
- 7. Attendance
- 8. Academics (Assessments, Common Tests, Marks & Report Cards)
- 9. Communication (Circulars, Templates)
- 10. Fees
- 11. Timetable
- 12. Gamification (Points, Batches, Leaderboards)
- 13. Network (Cross-Institute Partnerships)
- 14. Reports & Analytics
- 15. Audit Log
- 16. Compliance & Consent
- 17. Subscription & Plan
- 18. Appendix A — Full Sidebar-to-Screen Map
- 19. Appendix B — Interaction & State Matrix
- 20. Appendix C — Accessibility Notes

---

## 0. Design System Foundations

Every screen in this document is built from the primitives defined here. Screens reference these by name (e.g. "Primary Button") instead of re-describing style each time — read this section once before the screens.

### 0.1 Layout Grid

- **Desktop canvas:** 1440px reference width, 12-column grid, 24px gutters, 32px outer margin (left/right).
- **Content area width:** Sidebar (240px expanded / 64px collapsed) + Top bar (full width, 64px height, fixed/sticky) leaves a main content canvas of ~1176px on a 1440px screen.
- **Main content padding:** 32px top, 32px left/right, 40px bottom, on every screen inside the shell.
- **Max content width:** 1280px, centered, on very wide monitors — prevents tables/forms from stretching uncomfortably on ultrawide displays.
- **Tablet breakpoint:** ≤1024px — sidebar auto-collapses to icon rail (64px); content padding reduces to 24px.
- **Mobile breakpoint:** ≤768px — sidebar becomes an off-canvas drawer triggered by a ☰ burger icon; top bar condenses (see §1.5); content padding reduces to 16px; multi-column layouts stack to a single column.

### 0.2 Color Tokens

| Token | Hex (light mode) | Usage |
|---|---|---|
| `--color-primary` | #2E5AAC (deep institutional blue) | Primary buttons, active nav item, links, focus rings |
| `--color-primary-hover` | #24478A | Primary button hover/pressed state |
| `--color-surface` | #FFFFFF | Cards, drawers, modals, table background |
| `--color-canvas` | #F5F7FA | Page background behind cards |
| `--color-border` | #E2E6EC | Table borders, card outlines, dividers |
| `--color-text-primary` | #1A1F2B | Headings, primary body text |
| `--color-text-secondary` | #5B6472 | Helper text, labels, table secondary cells |
| `--color-text-disabled` | #A6ADB8 | Disabled fields, locked permission rows |
| `--color-success` | #1E8E5A | Active/Approved/Published badges, positive trend arrows |
| `--color-warning` | #B7791F | Pending badges, amber alerts, "near plan limit" bars |
| `--color-danger` | #C4362E | Inactive/Rejected/Overdue badges, destructive buttons, error text |
| `--color-info` | #2E5AAC | Informational banners (same as primary, lighter tint background #EAF0FB) |
| `--color-locked` | #8B93A1 | Disabled/locked permission checkboxes (least-privilege UI) |

Dark mode is out of scope for this spec but token names are chosen so a dark palette can be swapped in without renaming.

### 0.3 Typography Scale

| Style name | Size / weight | Usage |
|---|---|---|
| Display | 28px / 700 | Page titles only (one per screen, top-left of Page Header) |
| H2 | 20px / 600 | Section headers within a page (e.g. card group titles, drawer section headers) |
| H3 | 16px / 600 | Card titles, table column group headers, modal titles |
| Body | 14px / 400 | Table cell text, form input text, paragraph copy |
| Body Emphasis | 14px / 600 | Table primary-column values (e.g. a student's name in a row), active filter chip labels |
| Caption | 12px / 400 | Helper text under fields, timestamps, badge text, breadcrumbs |
| Micro | 11px / 500, uppercase, letter-spacing 0.04em | Table column headers, section eyebrow labels |

Font family: a single humanist sans-serif (e.g. Inter or equivalent) across the entire product — no secondary display font, to keep 16 modules feeling like one system rather than a patchwork.

### 0.4 Spacing Scale

4px base unit: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`. Component-internal padding uses the smaller steps (8/12/16); spacing *between* distinct components on a page uses the larger steps (24/32/40).

### 0.5 Core Component Library

These exact components are reused across every screen below. Each screen's spec says "Primary Button" etc. rather than re-deriving style.

**Primary Button**
- Style: filled, `--color-primary` background, white text, 8px corner radius, 14px/600 label, 10px vertical / 16px horizontal padding, optional leading icon (16px, 8px gap from label).
- Placement rule: exactly one per screen, always top-right of the Page Header (see §1.3), unless the screen is a wizard, in which case it lives in the sticky footer instead.
- States: default / hover (`--color-primary-hover`) / pressed (2px inset shadow) / disabled (40% opacity, no pointer) / loading (label replaced by a 16px spinner, button width locked to prevent layout shift).

**Secondary Button**
- Style: outlined, 1px `--color-border`, `--color-text-primary` text, white background, same radius/padding as Primary.
- Placement rule: sits immediately left of the Primary Button, 12px gap, when a screen needs a second visible action (e.g. "Bulk Import" next to "+ Add Student").

**Destructive Button**
- Style: outlined with `--color-danger` border and text (not filled — filled-red is reserved for irreversible confirmation-modal buttons only, to avoid a screen feeling alarming by default).
- Placement rule: never in the Page Header; lives inside the row `⋯` overflow menu or inside a Confirmation Modal's footer (there, it IS filled red, since the modal itself is already the "are you sure" gate).

**Overflow Menu (⋯)**
- Trigger: 32×32px icon button, 3 vertical dots, right-aligned in every table row and every card's top-right corner.
- Opens: a 200px-wide dropdown, left-aligned to the trigger's right edge (opens leftward if it would overflow viewport), listing 2–6 text actions stacked vertically, 36px row height each, destructive items separated by a 1px divider and rendered in `--color-danger`.

**Status Badge**
- Style: pill shape, 4px vertical / 10px horizontal padding, 12px/600 text, tinted background at 12% opacity of the status color with full-opacity text of the same color.
- Color mapping (fixed across the entire app): green = Active/Approved/Published/Verified; amber = Pending/Draft/In Progress; red = Inactive/Rejected/Overdue/Withdrawn; gray = Archived/Not Applicable.

**Data Table**
- Header row: `--color-canvas` background, Micro-style column labels, 44px height, sortable columns show a small ↕ chevron that becomes ↑/↓ on active sort.
- Body rows: 56px height (52px on dense tables like Audit Log), 1px bottom border `--color-border`, hover state tints row to `--color-canvas`.
- Row selection: 20px checkbox, left-most column, appears only on screens that support bulk actions; selecting 1+ rows reveals a **Contextual Action Bar** — a sticky bar replacing the filter bar, showing "N selected", the bulk actions available, and a "Clear" link.
- Row click target: entire row (except checkbox/⋯ cells) navigates to detail unless otherwise specified.
- Footer: 56px height, left = "Rows per page" selector (10/25/50/100), right = page-number controls with First/Prev/Next/Last.

**Card**
- Style: white surface, 1px `--color-border`, 12px corner radius, 8px soft drop-shadow on hover only (static shadow-free at rest to keep dashboards calm), 20px internal padding.

**Side Drawer**
- Width: 480px fixed, slides in from the right edge, full viewport height, overlays a 40%-opacity scrim over the rest of the screen (click-outside closes it, with an "unsaved changes?" guard if the form is dirty).
- Structure: Header (20px H2 title + 32×32 close ✕ icon top-right) → scrollable body (24px padding, form fields stacked vertically 16px apart) → sticky footer (1px top border, 16px padding, Secondary "Cancel" left-aligned... actually right-aligned per standard: Cancel then Primary Save, right-aligned, 12px gap).

**Modal (Confirmation / short forms)**
- Width: 440px (confirmation) or 560px (short form), centered, 40% scrim behind.
- Structure: H3 title → body copy or 1–3 fields → footer with Secondary (left) + filled action button (right, red if destructive, primary blue otherwise).

**Full-Page Wizard**
- Used only for genuinely multi-section flows (Role Builder, Common Test Creation).
- Header: step indicator — horizontal row of numbered circles connected by a line, current step filled `--color-primary`, completed steps show a check mark, future steps outlined gray with step label beneath each (12px caption).
- Body: single-column, max 720px wide, centered.
- Footer: sticky, full-width, 1px top border: "Back" (secondary, left) — "Step X of Y" (caption, center) — "Next" or final "Save"/"Create" (primary, right).

**Tabs**
- Horizontal, sit directly beneath the Page Header, 1px bottom border spanning full width, active tab has a 2px `--color-primary` underline and Body-Emphasis text; inactive tabs are `--color-text-secondary`.

**Filter Bar**
- Sits below Page Header (or below Tabs, if present), 48px height, horizontally arranged: filter chips/dropdowns left-aligned, Search input right-aligned (240px wide, magnifier icon leading), "Filters" button (mobile/narrow only, collapses all chips into a drawer).

**Empty State**
- Centered vertically and horizontally within its container, 48px icon (outline style, `--color-text-secondary`), H3 title, one line of Body-secondary explanatory text, then the screen's Primary Button repeated directly beneath.

**Toast / Snackbar**
- Bottom-center, 360px wide, dark surface (`--color-text-primary` background, white text), auto-dismiss after 4s, used for confirmations of async actions ("Role saved", "Invite sent") — never used for errors that need the user to act (those use inline field errors or a modal instead).

**Tooltip**
- Dark background, white 12px text, 6px padding, appears on hover/focus after 400ms delay, used heavily in the Role Builder for locked-permission explanations.

**KPI Card**
- 200–240px wide, Card style, contents: Micro-label top, large 28px/700 number center, small trend indicator (▲ green / ▼ red + percentage) bottom-left, optional right-aligned mini icon.

---

## 1. Global Navigation Shell

This shell wraps every screen described from Section 2 onward. It is rendered once and persists across navigation — only the main content region below it changes.

### 1.1 Top Bar

Fixed/sticky, full viewport width, 64px height, white surface, 1px bottom border `--color-border`, horizontal flex layout with the following elements left to right:

| # | Element | Position | Width/Size | Detail |
|---|---|---|---|---|
| 1 | Sidebar collapse toggle | Far left, 16px from edge | 32×32 icon button | Chevron icon; toggles sidebar between 240px expanded and 64px icon-rail. State persists per-user (localStorage-equivalent server pref). |
| 2 | Institute logo + display name | Next, 16px gap | Logo 32×32, name Body-Emphasis, max 180px truncated with ellipsis | Click → navigates to Dashboard. Hidden (logo only) when sidebar is in icon-rail mode to save space. |
| 3 | Branch Switcher | Next, 24px gap | Dropdown button, 180px wide | Shows current selection ("All Branches" default, or a branch name). Click opens a 240px dropdown: search box at top, "All Branches" pinned first with a divider, then alphabetical branch list, each row showing a small colored dot if that branch has pending items. Selecting filters every data screen app-wide until changed. |
| 4 | Academic Year selector | Next, 12px gap | Dropdown button, 120px wide | Defaults to the year where `is_current = TRUE`. Dropdown lists all `academic_years` rows for the institute, most recent first; selecting a past year adds a persistent "Viewing historical data — read only" banner (see §1.3) to every screen until reset to current. |
| 5 | Global Search | Center, flexible width (min 320px, expands to 480px on focus) | Icon + placeholder "Search students, staff, roles…" | Click/focus expands the field and opens a results panel below it (see §1.6). Keyboard shortcut `/` focuses it from anywhere. |
| 6 | Approvals icon | Right cluster, 16px from Notification icon | 32×32 icon button with numeric badge (top-right corner, red circle, white number) | Badge = count of all pending-approval items across the institute (leave + two-person point approvals + partnership requests awaiting response). Click → opens a dedicated dropdown listing each pending category with counts and a "Review" link per category, OR jumps straight to the relevant screen if only one category is pending. |
| 7 | Notification bell | Right cluster | 32×32 icon button with numeric badge | Click → opens Notification Drawer, §1.7. |
| 8 | Profile avatar | Far right, 16px from edge | 32×32 circular image/initials | Click → opens Profile Dropdown Menu, §1.8. |

Total right-cluster spacing: 12px between icons 6/7/8.

### 1.2 Left Sidebar

- **Expanded state:** 240px wide, full height below the top bar, white surface, 1px right border `--color-border`, vertical scroll if content exceeds viewport (rare).
- **Collapsed state:** 64px wide, icons only, tooltips on hover show the group name.
- **Structure:** 16 top-level groups, each a 44px-tall row: 20px leading icon, 12px gap, Body-Emphasis label, chevron on the right if the group has sub-items. Exactly **one group expanded at a time** (accordion behavior) — expanding a new group auto-collapses whichever was previously open, preventing the sidebar from ever showing more than roughly 8–10 total visible rows at once.
- **Sub-items:** appear indented 20px further, 40px row height, Body-style text, active sub-item shown with a `--color-primary` left-edge bar (3px) and tinted background (`--color-primary` at 6% opacity).
- **Group list, top to bottom, with sub-items:**
  1. 🏠 Dashboard — no sub-items, direct link
  2. 🏢 Institute Setup — Branches · Academic Structure · Branding & Profile
  3. 🔑 Roles & Permissions — Role Builder · Assignments · Governance Settings
  4. 👥 People — Staff · Students · Parents
  5. 📥 Admissions CRM — Enquiries · Funnel Report · Form Builder
  6. ✅ Attendance — Overview · Leave Approvals
  7. 📚 Academics — Assessments · Common Tests · Marks & Report Cards
  8. 📢 Communication — Circulars · Templates
  9. 💳 Fees — Structure · Collections
  10. 🗓️ Timetable — no sub-items (internal tabs instead, see §11)
  11. 🏆 Gamification — Points & Categories · Batch Catalog · Leaderboards
  12. 🌐 Network — Partnerships
  13. 📊 Reports & Analytics — no sub-items (internal gallery, see §14)
  14. 🧾 Audit Log — no sub-items
  15. 🛡️ Compliance & Consent — no sub-items (internal tabs)
  16. ⚙️ Subscription & Plan — no sub-items
- **Bottom-anchored, below the scrollable group list, pinned:** a thin divider, then a compact row showing app version/build (Caption text, `--color-text-secondary`) — purely informational, no interaction.

### 1.3 Standard Page Header

Used at the top of the main content region on every screen (24px below the top bar).

- **Breadcrumb** (Caption, `--color-text-secondary`): `[Sidebar Group] / [Page Name]`, e.g. "Roles & Permissions / Role Builder". Sits directly above the title, 4px gap.
- **Page Title** (Display style), left-aligned.
- **Historical-year banner** (conditional): if Academic Year selector (§1.1) is set to a non-current year, a full-width amber-tinted banner (`--color-warning` at 10% background) appears directly beneath the header row, Caption text: "Viewing [YYYY-YY] — historical data, read-only. [Return to current year]" (the bracketed text is a link).
- **Primary Button**: top-right, vertically centered with the Page Title.
- **Secondary Button** (if the screen has one): immediately left of Primary Button, 12px gap.
- **Overflow (⋯)** (if the screen needs page-level secondary actions beyond one Secondary Button, e.g. "Export", "Print"): 32×32 icon button immediately left of the Secondary Button.

### 1.4 Standard List/Table Screen Pattern

Reused by Staff, Students, Circulars, Assessments, Enquiries, Partnerships, and more. Vertical order:

1. Page Header (§1.3)
2. Tabs (only if the screen has them, e.g. Staff vs. nothing here — most list screens skip tabs)
3. Filter Bar (§0.5) — 24px gap below header/tabs
4. Data Table (§0.5) — 16px gap below filter bar, contained in a Card with no internal padding (table fills the card edge-to-edge, card just provides the border/radius)
5. Empty State — replaces the table entirely when zero rows match, retains the Filter Bar above it so users can adjust filters

### 1.5 Responsive Behavior

- **≤1024px (tablet):** Sidebar auto-collapses to 64px icon rail on load (user can still expand manually, but it reverts on next page load). Top bar's Academic Year selector and Branch Switcher merge into a single "Context" button that opens a bottom sheet with both controls stacked.
- **≤768px (mobile):** Sidebar becomes a full-height off-canvas drawer, triggered by a ☰ burger icon that replaces the collapse toggle at top-bar position #1. Global Search collapses to an icon that opens a full-screen search overlay on tap. KPI card rows become horizontally swipeable carousels instead of a fixed grid. Tables convert to stacked card rows (each row's cells become label:value pairs in a mini-card) instead of horizontal scrolling. Wizards go full-screen with the step indicator condensed to "Step X of Y" text only (no dot row).

### 1.6 Global Search Results Panel

- Appears below the Search field on focus/typing, 480px wide, Card style, max-height 400px scrollable.
- Grouped by entity type with Micro-style section headers: **Students**, **Staff**, **Roles**, **Circulars** — each group shows up to 3 results with a "See all N results" link at the group's bottom if more exist.
- Each result row: small avatar/icon, primary text (name), secondary Caption text (e.g. admission number, employee code, role scope).
- Empty query state: shows "Recent" (last 5 things this admin viewed) instead of a blank panel.

### 1.7 Notification Drawer

- Trigger: bell icon, §1.1 item 7.
- Slides in from the right, 380px wide, full height, overlays content (does not navigate away from current screen).
- Header: H3 "Notifications" + "Mark all as read" link (right-aligned, Caption) + close ✕.
- Body: grouped by relative day ("Today" / "Yesterday" / "Earlier"), each Micro-style group header, then rows: 40px leading type-icon (colored by `notification_type`), Body text (one line, truncates), Caption timestamp below, unread items marked with a 6px `--color-primary` dot on the left edge of the row.
- Footer: sticky, "View all notifications" link, centered, opens the full-page version with filters (Type, Date range, Read/Unread).

### 1.8 Profile Dropdown Menu

- Trigger: avatar, §1.1 item 8.
- Opens a 240px dropdown, right-aligned to the avatar:
  - Header block: avatar (40px), name (Body-Emphasis), role label "Institute Admin" (Caption), institute name (Caption, secondary).
  - Divider.
  - Menu items (36px rows each): "My Profile", "Institute Settings" (deep-links to §3.5), "Switch Institute" (only rendered if this admin account is linked to more than one institute — otherwise omitted entirely, not shown disabled), "Help & Support".
  - Divider.
  - "Log out" (in `--color-danger` text).

---

## 2. Dashboard

**Nav path:** Sidebar → Dashboard (also the default landing screen immediately after login)
**Breadcrumb:** Dashboard
**Page Title:** "Dashboard"
**Primary Button:** none (this is a read/overview screen — no single dominant creation action belongs here, which is itself a deliberate choice to keep the landing screen calm)

### Layout Overview (top to bottom, full content width, 32px vertical gaps between regions)

**Region A — Greeting Bar**
- Full width, no card container (sits directly on `--color-canvas`), 8px vertical padding.
- Left: "Good [morning/afternoon/evening], [Admin First Name]" in H2, with today's date + weekday in Caption directly beneath ("Saturday, 18 July 2026").
- Right, vertically centered with the greeting: a small Caption reminder of current context — "Viewing: All Branches · AY 2026-27" — mirrors the top-bar Branch Switcher/Academic Year state so the admin never wonders what scope they're looking at without glancing at the top bar.

**Region B — KPI Card Row**
- Horizontal row of 5 KPI Cards (§0.5), equal width, 16px gaps, wraps to a 3+2 grid on tablet, horizontally swipeable carousel on mobile.
- Card 1: "Total Active Students" — number, trend vs. last month.
- Card 2: "Total Staff" — number, no trend (headcount changes rarely enough that a trend arrow adds noise).
- Card 3: "Today's Attendance" — percentage, trend vs. yesterday; entire card is clickable → Attendance Overview (§7.1).
- Card 4: "Fee Collection (This Month)" — ₹ amount as the large number, Caption beneath showing "X% of expected"; clickable → Fees Collections (§10.4).
- Card 5: "Open Enquiries" — count, Caption beneath showing "+N today"; clickable → Admissions Enquiries (§6.1).

**Region C — "Needs Your Attention" Panel**
- Full-width Card, H2 title "Needs your attention" top-left inside the card, no button in the card header.
- Body: vertical stack of attention-rows, each 56px tall, separated by 1px dividers, structure per row: 24px leading icon (colored to match urgency) → flex-grow Body text (one line, e.g. "3 leave applications pending your review") → numeric count Badge (amber) → right-aligned Secondary-style small button ("Review") that deep-links straight into the relevant filtered screen (e.g. Leave Approvals pre-filtered to Pending).
- Rows shown, in fixed priority order (highest-urgency first): Pending leave approvals → Pending two-person point-award approvals → Unverified institute documents → Students below 75% attendance this month → Common tests with all branches submitted, awaiting the publish gate → Incoming cross-institute partnership requests awaiting response.
- If a category has zero items, its row is omitted entirely (not shown grayed-out) — the panel's height simply shrinks.
- **Fully-clear state:** if every category is zero, the whole panel collapses to a single centered 48px-tall strip: a green checkmark icon + "You're all caught up ✅" (Body, `--color-success`), no card padding waste.

**Region D — Branch Comparison Strip**
- Only rendered when the top-bar Branch Switcher is set to "All Branches" (hidden entirely when a specific branch is selected, since the comparison has nothing to compare).
- Full-width Card, H2 title "Branch Comparison" top-left, Caption "This month" top-right inside the card header.
- Body: one horizontal grouped bar-chart per branch (branch name as the Y-axis label, three small bars per branch for Attendance %, Fee Collection %, Avg. Leaderboard Points — each bar in a distinct but muted color, small legend beneath the chart).
- Clicking a branch's row/label sets the Branch Switcher to that branch and refreshes the whole app scope (matches the top-bar's own behavior, so this acts as a shortcut, not a separate mechanism).

**Region E — Two-Column Row** (equal 50/50 width, 24px gap between columns; stacks to full-width sequential blocks on tablet/mobile)
- **Left column — "Recent Activity" Card:** H2 title + "View full Audit Log" link (top-right inside card header, Caption, links to §15). Body: vertical feed of the 10 most recent audit-worthy events, each row: small actor avatar, Body text ("[Admin Name] created role 'Sports Coordinator'"), Caption timestamp right-aligned ("2h ago").
- **Right column — "Upcoming" Card:** H2 title + "View Timetable" link (top-right inside card header). Body: vertical list of the next 5 academic-calendar items, each row: a small date chip (day number large, month abbreviation small, in a 40×40 rounded square) + event name (Body) + type Badge (Exam/Holiday/PTM, colored per §0.5 mapping loosely repurposed for event type rather than status).

**Region F — Admissions Funnel Mini-Widget**
- Full-width Card, H2 title "Admissions Funnel — This Month" top-left, "View Full Report" link top-right (Caption, → §6.2).
- Body: a compact 4-stage horizontal funnel bar (Enquiry → Visit Scheduled → Applied → Enrolled), each stage a proportionally-widthed colored segment with the count printed inside it and the conversion percentage to the next stage printed in the gap between segments.

### Mobile Adaptation Notes
- Region A collapses the right-hand context Caption under the greeting instead of beside it.
- Region B becomes a swipeable carousel (dots indicator beneath).
- Regions C–F stack full-width in the same vertical order; Region D is still hidden unless "All Branches" is active.

---

## 3. Institute Setup

### 3.1 Branches List

**Nav path:** Institute Setup → Branches
**Breadcrumb:** Institute Setup / Branches
**Page Title:** "Branches"
**Primary Button:** "+ Add Branch" (top-right of Page Header) → opens §3.2 drawer.

Follows the Standard List/Table Screen Pattern (§1.4):

- **Filter Bar:** Status filter chip (All/Active/Inactive, default All), Search box right-aligned (searches name and branch_code).
- **Data Table columns**, left to right:
  1. Checkbox (bulk select — bulk actions here limited to "Deactivate")
  2. Branch Name (Body-Emphasis, clickable → §3.3) with Head Office flag shown as a small "HQ" Micro-badge inline next to the name when `is_head_office = TRUE`
  3. Code (`branch_code`, Caption/monospace-style)
  4. City (from `city`/`state`)
  5. Branch Admin (`branch_admin_name`)
  6. Student Count (right-aligned number)
  7. Status — rendered as an inline toggle switch (not a static badge, since Active/Inactive is directly togglable from the list by an Institute Admin) — toggling opens a small inline confirm tooltip before committing
  8. `⋯` overflow: "View Details", "Edit", divider, "Deactivate Branch" (red)
- **Empty State:** icon (building outline), "No branches yet", "Add your first branch to start setting up classes, staff, and students." + repeated Primary Button.

### 3.2 Add / Edit Branch (Side Drawer)

**Trigger:** "+ Add Branch" (create) or row `⋯` → "Edit" (edit, pre-filled)
**Drawer title:** "Add Branch" / "Edit Branch — [Name]"

Body, organized into 4 collapsible sub-sections (accordion-style within the drawer, "Identity" expanded by default, others collapsed to keep the initial view short):

1. **Identity** — Branch Name (text, required), "Set as Head Office" (toggle, disabled+tooltip if another branch already holds this flag until that one is unset first).
2. **Address** — Address Line 1 (required), Address Line 2 (optional), City (required), State (required), Country (dropdown, defaults "India"), Postal Code, and a small embedded map picker (200px tall) that sets `latitude`/`longitude` via pin-drop, with manual lat/long fields beneath it for precision entry.
3. **Contact** — Branch Phone, Branch Email, Branch Admin Name (free text at this stage — actual role/user assignment happens later in People → Staff).
4. **Settings** — Timezone (dropdown, defaults `Asia/Kolkata`).

**Footer:** Secondary "Cancel" + Primary "Save Branch" (right-aligned, 12px gap). Validation errors appear inline beneath each field in `--color-danger`, Caption size, on blur or on failed submit attempt.

### 3.3 Branch Detail

**Nav path:** Institute Setup → Branches → [Branch Name]
**Breadcrumb:** Institute Setup / Branches / [Branch Name]
**Page Title:** Branch name, with the Status Badge (Active/Inactive) inline to its right.
**Primary Button:** none in the header; "Edit" is a Secondary Button top-right instead (this is a detail/read screen, editing is the secondary action, not creation).
**Overflow (⋯):** "Deactivate Branch" (red, opens Confirmation Modal explaining cascading effects: "Deactivating this branch will hide it from Branch Switcher for all roles and disable new enrollments here. Existing student/staff records are retained.")

**Tabs** (§0.5), directly under header: **Overview | Staff | Students | Class Sections | Rooms | Overrides**

- **Overview tab:** two-column layout. Left column: Address Card (map thumbnail + full address text). Right column, stacked: Contact Card (phone/email/admin name) above a Quick Stats Card (3 stat rows: Staff count, Student count, Class Sections count, each right-aligned number with a small link "View →" to the matching tab).
- **Staff tab:** embeds a filtered version of the People → Staff table (§5.1) pre-filtered to this branch, same column set, no page header repeated (tab context replaces it).
- **Students tab:** embeds a filtered version of People → Students table (§5.4), same pattern.
- **Class Sections tab:** table — Class, Section, Academic Year, Class Teacher, Student Count, `⋯` (View Roster); primary action "+ Add Section" top-right of the tab body (small Secondary button, since this is a sub-action within a tab, not a full Primary page action).
- **Rooms tab:** table — Room Number, Type (Classroom/Lab/Library/Hall/Office/Other), Capacity, Floor, Building, Status, `⋯` (Edit, Deactivate). Primary action "+ Add Room" top-right of the tab body (Secondary button). Add Room drawer includes Room Number, Type (dropdown), Capacity (number), Floor, Building, and Active Status.
- **Overrides tab:** the most conceptually important tab on this screen — renders the institute's override model as a clear two-column comparison, not a settings form:
  - Left column, headed "🔒 Locked institute-wide" (gray card background): a static list — Point Category Catalog, Batch Definitions, Grading Scale, Class/Subject Naming. Each item shown with the lock icon and Caption text "Set by Institute Setup — applies to every branch identically."
  - Right column, headed "✏️ This branch can override" (white card, editable): a list of override-able settings — Local Grading Remarks (text), Local Holiday Calendar (link to a mini calendar editor) — each with an inline "Edit" affordance.

### 3.4 Academic Structure

**Nav path:** Institute Setup → Academic Structure
**Breadcrumb:** Institute Setup / Academic Structure
**Page Title:** "Academic Structure"
**Tabs:** **Academic Years | Classes | Subjects** (directly under the Page Header, replacing a Filter Bar since these lists are short and rarely need filtering)

- **Academic Years tab:**
  - Primary Button (top-right of Page Header, persists across all 3 tabs but its action changes per tab): "+ Add Academic Year" while this tab is active.
  - Table: Name (e.g. "2026-27"), Start Date, End Date, Current-Year Badge (green "Current" badge on the one row where `is_current = TRUE`), `⋯` ("Set as Current" / "Edit").
  - Add opens a small 3-field Modal (Name, Start Date, End Date) rather than a full drawer — short enough not to need one.

- **Classes tab:**
  - Primary Button becomes "+ Add Class".
  - List rendered as an **accordion list** - each row: 6-dot drag handle (left), Class Name (Body-Emphasis) which acts as an accordion trigger, `...` (Edit/Delete). Dragging updates `sort_order` live with an auto-save toast ("Order updated").
  - **Curriculum Panel (Accordion Body):** Clicking a class expands a panel showing the curriculum mapped to that class. It displays a table of mapped subjects: Subject Name, Subject Code, Periods-per-week, Core-or-elective badge, and a **Teacher** assignment dropdown (this directly writes to `subject_teacher_assignments`). Primary action within panel: "+ Add Subject to Class".
  - A Caption note sits above the list: "Classes are branch-wise - each branch defines its own classes independently to prevent data sharing across branches."

- **Subjects tab:**
  - Primary Button becomes "+ Add Subject".
  - Simple Data Table: Subject Name, Subject Code, `⋯` (Edit/Delete).

Add/Edit for Classes and Subjects both use a lightweight 2-field Modal (Name + optional Code), consistent with the "short form → Modal, not drawer" rule.

### 3.5 Branding & Profile

**Nav path:** Institute Setup → Branding & Profile (also reachable via Profile Dropdown → "Institute Settings")
**Breadcrumb:** Institute Setup / Branding & Profile
**Page Title:** "Institute Profile"
**Primary Button:** "Save Changes" — but positioned unusually for this screen: instead of the Page Header, it's **sticky to the bottom of the viewport** (full-width bar, white surface, 1px top border, button right-aligned within it) since this is a single long scrollable form and the save action should stay reachable without scrolling back up.

**Layout:** two-column — a 200px-wide **sticky left-side section nav** (Body text links: Identity · Legal & Compliance · Head Office Contact · Branding Assets · Academic Defaults, active section highlighted via scroll-spy) + a wide right-side scrollable form area.

- **Identity section:** Legal Name, Display Name, Institute Type (dropdown: school/college/coaching_center/university/other), Board Affiliation (dropdown), Board Affiliation Number, UDISE Code, Establishment Year (number), Medium of Instruction.
- **Legal & Compliance section:** Registered Entity Type (dropdown), Registration Number, PAN Number, GST Number. Beneath the fields, a sub-panel "Institute Documents": a small table (Document Type, Uploaded Date, Verified Badge) with a "+ Upload Document" Secondary button (opens a Modal: document type dropdown + file picker).
- **Head Office Contact section:** Address Line 1/2, City, State, Country, Postal Code, Primary Email, Primary Phone, Alternate Phone, Website URL, and Primary Point of Contact sub-fields (Name, Designation, Phone, Email).
- **Branding Assets section:** two-column within the section — left: Logo uploader (drag-and-drop zone, 120×120 preview once set, "Replace"/"Remove" links beneath) and Letterhead uploader (same pattern); right: a **live preview panel** (Card, sticky within this section) showing a miniature sample report-card header rendered with the current logo, name, and color choice, updating in real time as the admin edits — this is what lets a non-technical admin see the effect of branding choices immediately instead of guessing. Primary Color: a swatch button that opens a color picker + a hex text input beside it.
- **Academic Defaults section:** Default Grading Scale (radio group: Percentage / GPA / Letter Grade / Custom), Academic Year Start Month (dropdown, month names).

---

## 4. Roles & Permissions

This module maps directly to `permissions`, `roles`, `role_permissions`, `user_role_assignments`, and §1 of the feature spec. It is the most detail-sensitive module in the product — every component here exists to make a powerful, potentially dangerous capability (granting access) feel safe and legible.

### 4.1 Roles List

**Nav path:** Roles & Permissions → Role Builder (this sub-item is the list's landing view, labeled "All Roles" as the screen's actual Page Title)
**Breadcrumb:** Roles & Permissions / All Roles
**Page Title:** "All Roles"
**Primary Button:** "+ Create Role" → opens §4.2 wizard.

- **Tabs (used here instead of filter chips, since scope is the primary mental model users need):** **All | System Roles | Institute-wide | Branch-scoped**
- **Data Table columns:**
  1. Role Name (Body-Emphasis, click → Role Detail panel, a read-only variant of the wizard's Step 3 review screen, reachable in a slide-over)
  2. Scope Badge — "All Branches" (blue-tinted) for institute-wide custom roles, specific branch name (neutral gray-tinted) for branch-scoped, "System" (dark gray) for system roles
  3. # Users Assigned (number, click → deep-links to §4.3 pre-filtered to this role)
  4. Created By (avatar + name, "Platform" for system roles)
  5. `⋯` — "Clone", "Edit" (disabled + tooltip "System roles can't be edited — clone it instead" for `is_system_role = TRUE` rows), divider, "Deactivate" (red, disabled for system roles)
- **Empty State** only applies within the "Institute-wide"/"Branch-scoped" tabs if none exist yet: "No custom roles yet — clone a system role or start from scratch." + repeated Primary Button.

### 4.2 Role Builder (Full-Page Wizard, 3 Steps)

Uses the Full-Page Wizard component (§0.5): step indicator header, single-column 720px body, sticky footer.

**Step 1 — Basics**
- Section H2: "Start from a template"
- Row of template Cards (120px tall, selectable — selected card gets a `--color-primary` 2px border): "Blank", "Clone Teacher", "Clone Branch Admin", plus one card per existing custom role in this institute (scrollable row if many). Selecting a clone-source pre-fills Steps 1–2 with that role's data, editable from there.
- Section H2: "Role details" — Role Name (text, required, live-validated against existing role names for uniqueness within the same institute+branch scope per the schema's UNIQUE constraint), Description (textarea, optional, 2 rows).
- Section H2: "Scope" — radio group exactly as specified: "○ This role applies to one branch" (reveals a branch dropdown beneath when selected, options limited to branches this Institute Admin manages — for an Institute Admin that's all branches, but the same screen is reused by a Branch Admin persona with a narrower list) / "○ All branches of this institute" (default selected).

**Step 2 — Permission Matrix**
- Layout: left rail (200px) of module tabs, stacked vertically: Students, Attendance, Academics, Communication, Leaderboard & Points, Roles, Reports — each tab shows a small count badge of how many permissions are currently checked within it (e.g. "Attendance (2)"), so the admin can track progress without opening every tab.
- Right area: the checkbox grid for the selected module. Each row: checkbox (20px) → Permission plain-English description (Body, from `permissions.description`, NOT the raw `permission_key`) → the raw key shown in Caption/monospace beneath the description for technically-minded admins who want it, de-emphasized.
- **Locked-permission state:** if the permission isn't held by the current admin's own effective permission set, the checkbox renders disabled (`--color-locked`) with a small 🔒 icon at the row's right edge; hovering/focusing the row shows a Tooltip: "You don't have this permission yourself, so you can't grant it."
- **Leaderboard & Points module — special inline sub-controls:** when the `points.award_manual` row is checked, two additional indented rows animate open directly beneath it (12px left indent, connected by a thin vertical guide line to signal "these belong to the row above"):
  - "Maximum per single award" — a numeric stepper (− / value / +), default 20, with Caption "points" suffix.
  - "Allowed categories" — a multi-select chip input; clicking it opens a small popover checklist of all `point_categories` (platform default + institute-added); selected categories render as removable chips inline in the field.
  - The `leaderboard.configure` permission is listed as its own separate top-level row in this same module (not nested under `.view`), with Caption helper text: "Controls who can change leaderboard scope/visibility — separate from just viewing rankings."

**Step 3 — Review**
- Section H2: "Plain-English summary" — a Card with a bulleted list, auto-generated from every checked permission, phrased as user-facing capability statements (e.g. "Mark attendance for their assigned classes", "Award points manually, up to 20 pts per award, Sports category only"). This is the safety-net read-back before saving.
- Section H2: "Scope recap" — one line: "This role will apply to: [All Branches / Branch Name]."
- Footer: "Back" (secondary) / "Save Role" (primary — label changes to "Create Role" vs "Save Changes" depending on create/edit mode).
- On save: Toast "Role '[Name]' saved" + redirect to §4.1 with the new/edited row highlighted briefly (2s background flash).

### 4.3 Role Assignments

**Nav path:** Roles & Permissions → Assignments
**Breadcrumb:** Roles & Permissions / Assignments
**Page Title:** "Role Assignments"
**Primary Button:** "+ Assign Role" → opens a Side Drawer (see below).
- Directly beneath the Page Header, an **Info Banner** (full width, `--color-info` tinted background, 40px tall, small info icon + Caption text): "A user can hold more than one role at once — e.g. Teacher at Branch A + Sports Coordinator at Branch A & B."
- **Filter Bar:** Role (dropdown, all roles), Branch, Status (Active/Expired), Search (by user name).
- **Data Table columns:**
  1. User (avatar + name, click → jumps to that user's profile, §5.2 or §5.6 depending on type)
  2. Role(s) Held — stacked small Badge chips (one per assignment this user has), each chip showing role name; if more than 3, show first 2 + "+N more" chip that expands on click
  3. Scope (per the row's specific assignment being displayed — if a user has multiple assignments, they appear as multiple rows, one per assignment, not merged, so scope/expiry stay unambiguous per-row)
  4. Assigned By (name)
  5. Valid Until (date, or "—" if permanent; if within 7 days of expiry, rendered in `--color-warning` with a small clock icon)
  6. `⋯` — "Edit Assignment", "Revoke" (red, opens Confirmation Modal: "Revoking this role takes effect immediately, even for an active session.")

**Assign Role Drawer**
- Title: "Assign Role"
- Fields, top to bottom: User (searchable select, shows avatar+name+employee-code in results), Role (searchable select, grouped by System/Institute-wide/Branch-scoped in the dropdown), Branch(es) (multi-select, only rendered/required if the selected role is branch-scoped — hidden entirely for institute-wide/system roles to avoid a meaningless field), Valid Until (optional date picker, Caption beneath: "Leave blank for a permanent assignment").
- Footer: Cancel / "Assign Role" (primary).

### 4.4 Governance Settings

**Nav path:** Roles & Permissions → Governance Settings
**Breadcrumb:** Roles & Permissions / Governance Settings
**Page Title:** "Governance Settings"
**Primary Button:** "Save" — positioned bottom-right of the form Card (this is a short settings form, not a long scroll, so the button doesn't need to be sticky like §3.5).

Single Card, vertical stack of settings rows (each row: label + description on the left, control on the right, 1px divider between rows):

1. **"Require two-person approval for large point awards"** — toggle switch. When ON, reveals an indented sub-row: "Threshold" — numeric stepper, default 50, Caption suffix "points — awards above this require a second approver before posting to the ledger."
2. **"Notify me before a temporary role expires"** — toggle switch. When ON, reveals: "Remind" — dropdown (3 days / 7 days / 14 days before `valid_until`).
3. A non-interactive info row (no control, full-width Caption text in a muted box): "Deactivating a role revokes it from every assigned user immediately — checked at request time, not just at login."

---

## 5. People

### 5.1 Staff List

**Nav path:** People → Staff
**Breadcrumb:** People / Staff
**Page Title:** "Staff"
**Primary Button:** "+ Invite Staff" → opens §5.2 drawer.

- **Filter Bar:** Branch, Role, Status (Active/Inactive), Search (name/employee code) right-aligned.
- **Data Table columns:**
  1. Checkbox (bulk: "Assign Role", "Deactivate")
  2. Photo (28px circular) + Name (Body-Emphasis), click → §5.3
  3. Employee Code (Caption/monospace)
  4. Role(s) — stacked Badge chips (reuses the same chip pattern as §4.3)
  5. Branch — branch name (staff are strictly isolated per branch)
  6. Phone
  7. Status — inline toggle (same pattern as §3.1)
  8. `⋯` — "View Profile", "Edit", "Reset Password", divider, "Deactivate" (red)

### 5.2 Invite Staff (Side Drawer)

**Trigger:** "+ Invite Staff"
**Drawer title:** "Invite Staff Member"

Fields, single column: Full Name (required), Phone (required, this becomes the OTP login identity per schema), Email (optional), Employee Code (text, auto-suggested placeholder based on institute's numbering pattern, editable), then a divider, then a sub-section H3 "Initial Role Assignment": Role (searchable select) + Branch (required, single select). Footer: Cancel / "Send Invite" (primary — label deliberately says "Send Invite" not "Save", to set the right expectation that this triggers an OTP-based onboarding link rather than instantly creating a logged-in account).

### 5.3 Staff Profile

**Nav path:** People → Staff → [Name]
**Breadcrumb:** People / Staff / [Name]
**Page Title:** Staff full name, Status Badge inline beside it.
**Secondary Button (top-right):** "Edit Profile". **Overflow (⋯):** "Reset Password", "Deactivate" (red).

**Tabs:** **Overview | Roles & Permissions | Classes & Subjects | Attendance | Documents**

- **Overview tab:** Card layout — Contact Info Card (phone, email), Employment Card (employee code, joined date, last login timestamp).
- **Roles & Permissions tab:** embeds a read-filtered view of §4.3's table (rows = this user's assignments only) plus a small "+ Add Role" Secondary button inline above it (opens the same Assign-Role drawer pre-filled with this user).
- **Classes & Subjects tab:** table of `subject_teacher_assignments` — Class-Section, Subject, Academic Year — read-only (assignment happens from the Timetable/Class Section screens, not duplicated here).
- **Attendance tab:** this staff member's own attendance history (calendar heatmap view — a compact month grid, each day cell colored present/absent/leave).
- **Documents tab:** table of uploaded staff documents (contract, ID proof, etc.) + "+ Upload Document" Secondary button.

### 5.4 Students List

**Nav path:** People → Students
**Breadcrumb:** People / Students
**Page Title:** "Students"
**Primary Button:** "+ Add Student"
**Secondary Button (immediately left of Primary):** "Bulk Import" → opens a dedicated 3-step import flow (Modal sequence): Step 1 upload CSV/Excel, Step 2 column-mapping (auto-detected mapping shown, editable dropdowns per column), Step 3 validation results table (rows flagged red for errors with the specific issue in a Caption beneath, e.g. "Missing date_of_birth") — only valid rows commit; a summary line reads "48 of 50 rows will be imported. 2 rows have errors and will be skipped." with "Import 48 Students" as the final confirm button.

- **Filter Bar:** Branch (forced single select to ensure strict branch isolation), Class, Section, Status (Active/Withdrawn/Alumni, default Active), Search (name or admission number — admission number search is exact-match prioritized in results ordering).
- **Data Table columns:**
  1. Checkbox (bulk: "Transfer Section", "Withdraw")
  2. Photo + Name, click → §5.6
  3. Admission Number (Caption/monospace)
  4. Class - Section (e.g. "Grade 8 - A")
  5. Roll No.
  6. Parent Name (click → jumps to §5.7 parent profile)
  7. Status Badge (Active green / Withdrawn red / Alumni gray)
  8. `⋯` — "View Profile", "Edit", "Transfer Section", divider, "Withdraw Student" (red)

### 5.5 Add Student (Side Drawer)

**Trigger:** "+ Add Student"
**Drawer title:** "Add Student"

Accordion sub-sections (Profile expanded by default):
1. **Profile** — Full Name, Date of Birth (date picker), Gender (dropdown), Photo (uploader), Blood Group, Allergies/Medical Notes (textarea).
2. **Contact** — Address (textarea), Emergency Contact Name, Emergency Contact Phone.
3. **Enrollment** — Branch (dropdown), Class (dropdown), Section (dropdown, populated after Class chosen), Academic Year (defaults current), Roll Number.
4. **Guardian** — "Link existing parent" (searchable select, for siblings) OR "Add new parent" (inline mini-form: Name, Phone, Relationship dropdown father/mother/guardian, Primary Contact toggle) — a radio at the top of this section switches between the two modes.
5. **Consent** — a required checkbox: "Parent has provided data-processing consent" (writes a `consent_records` row on save) with a link "View consent language" opening the current consent text in a read-only Modal.

Footer: Cancel / "Add Student" (primary).

### 5.6 Student Profile

**Nav path:** People → Students → [Name]
**Breadcrumb:** People / Students / [Name]
**Page Title:** Student full name, Status Badge + Class-Section badge inline beside it.
**Secondary Button:** "Edit Profile". **Overflow (⋯):** "Transfer Section", "Generate ID Card", "Withdraw Student" (red).

**Tabs:** **Overview | Academic History | Attendance | Points & Batches | Documents | Guardians**

- **Overview tab:** compact info Card — photo (80px), DOB, blood group, allergies/medical notes, address, emergency contact — each field label:value pair, with a single pencil-edit icon top-right of the card (inline edit, not a separate page, since the field set is short).
- **Academic History tab:** table — Academic Year, Class-Section, Roll Number, one row per `student_enrollments` record, most recent first — gives the full multi-year history described in the CRM feature spec.
- **Attendance tab:** month calendar heatmap (same pattern as §5.3's staff attendance tab) + a small summary strip above it (This Month %, This Term %, Year %).
- **Points & Batches tab:** two stacked sections — (a) **Point Ledger** table (Date, Category Badge, Points [+N in green], Source Type, Awarded By, Note) mirroring `point_transactions`, newest first, paginated; (b) **Earned Batches** gallery beneath it — grid of badge-icon cards (icon, name, awarded date, tier if applicable) — gives the admin the exact same view a parent would see, useful for dispute resolution as noted in the spec.
- **Documents tab:** Document Vault — table (Document Type, Uploaded Date) grouped by type (Report Cards / Certificates / Transfer Certificate / Medical Records) with a "+ Upload" Secondary button.
- **Guardians tab:** list of linked parents as Cards (name, phone, relationship Badge, "Primary Contact" star icon if applicable), "+ Link Guardian" Secondary button top-right of the tab body.

### 5.7 Parents List

**Nav path:** People → Parents
**Breadcrumb:** People / Parents
**Page Title:** "Parents"
**Primary Button:** none (parents are created via the student admission flow, §5.5, not directly) — instead a **Secondary Button** top-right: "Link Existing Parent" (for registering a sibling's parent to a new student without duplicating the parent record — opens a short Modal: search existing parent by phone → select student to link → Relationship dropdown → confirm).

- **Filter Bar:** Search (name/phone) only — this list rarely needs heavier filtering.
- **Data Table columns:**
  1. Name
  2. Phone
  3. Linked Children — Badge chips, one per child, each chip clickable → jumps directly to that student's profile (§5.6)
  4. Last Login (relative time, e.g. "3 days ago")
  5. `⋯` — "View Profile", "Deactivate" (red)

---

## 6. Admissions CRM

### 6.1 Enquiries

**Nav path:** Admissions CRM → Enquiries
**Breadcrumb:** Admissions CRM / Enquiries
**Page Title:** "Enquiries"
**Primary Button:** "+ Add Enquiry" (top-right) — for manual entry of phone/walk-in leads.
**View toggle:** a small segmented control immediately left of the Primary Button: 🔲 Board / ☰ List, defaulting to Board.

**Filter Bar** (applies to both views): Source (Website/Meta/Google/Walk-in/Referral — multi-select chips), Counselor (dropdown), Grade Applied For (dropdown), Date Range picker. Search box right-aligned.

**Board View (default):**
- Horizontal Kanban with 6 fixed columns: New → Contacted → Visit Scheduled → Applied → Enrolled → Lost, each column header shows the column name + a count badge.
- Each **Enquiry Card** (within a column): Prospective Student Name (Body-Emphasis), Grade Applied For (Caption beneath), a small icon in the top-right corner of the card denoting Source Channel (website/meta/google/walk-in/referral, distinct icon per source), Counselor avatar (24px, bottom-left of card), Lead Score Badge (bottom-right of card, colored Hot=red/Warm=amber/Cold=gray based on score banding).
- Cards are drag-and-drop between columns (dragging updates stage); dropping also triggers a small toast confirming the move and, for "Lost", opens a quick 1-field Modal asking for a lost-reason (optional but encouraged) before committing.
- Column can be collapsed (chevron in column header) to a thin 40px strip for admins who want to focus on fewer stages at once.

**List View:** standard Data Table with columns Name, Grade, Source (icon+label), Counselor, Lead Score Badge, Stage Badge, Last Activity (relative time), `⋯` ("Open", "Reassign Counselor").

**Enquiry Detail (Side Drawer, opens on card/row click):**
- Header: Prospective Student Name + Grade Applied For (Caption beneath name).
- **Immediately below the header, above everything else** (placed here deliberately since these are the two most common actions taken on an enquiry): a horizontal pair of quick-action dropdowns — "Stage: [current stage ▾]" and "Counselor: [current name ▾]" — both instantly-committing selects, no separate save step.
- Body below: Contact Info block (phone/email), Activity Timeline (vertical list of logged touches — call, WhatsApp sent, visit completed — each with timestamp and the staff member who logged it), "+ Log Activity" Secondary button beneath the timeline (opens a small inline form: Activity Type dropdown + Note text + timestamp defaulting to now).
- Footer: Cancel(close) / no primary save button needed since the quick-action selects and activity log already commit inline — footer instead just shows "Convert to Application" (primary) once stage reaches "Applied", which deep-links to the student Add flow (§5.5) pre-filled from the enquiry's captured data.

### 6.2 Funnel Report

**Nav path:** Admissions CRM → Funnel Report
**Breadcrumb:** Admissions CRM / Funnel Report
**Page Title:** "Admissions Funnel"
**Secondary Button (top-right):** "Compare Branches" — toggles the main visualization from a single funnel into a grouped bar chart (one bar-group per branch, same 4 stages) for the cross-branch comparison capability named in the CRM spec.
**Filter Bar:** Date Range picker, Branch (hidden/disabled while "Compare Branches" is active, since that mode already breaks out by branch).

- **Region 1 — Funnel Visualization:** large horizontal funnel, 4 stages (Enquiry → Visit Scheduled → Applied → Enrolled), each stage a progressively narrower colored trapezoid segment showing the absolute count inside it and the conversion percentage to the next stage printed in the connector gap between segments.
- **Region 2 — Drop-off by Source Table:** beneath the funnel, a Data Table — Source Channel, Enquiries, Converted, Conversion % (color-coded: green if above institute average, red if notably below) — lets the admin see, e.g., that walk-ins convert far better than a specific ad channel.

### 6.3 Form Builder

**Nav path:** Admissions CRM → Form Builder
**Breadcrumb:** Admissions CRM / Form Builder
**Page Title:** "Application Form Builder"
**Primary Button:** "Publish Form" (top-right). **Secondary Button:** "Preview Link" (copies/opens the public form URL).

**Layout:** two-column, no page scroll on the frame itself (each column scrolls independently):
- **Left column (fixed 320px) — Field Palette:** draggable field-type chips (Text, Dropdown, File Upload, Date), grouped under a Micro header "Add Fields". Beneath the palette, a **Field List** of the form's current fields in order (drag-handle to reorder), each row showing the field label + a small type-icon, clicking a row selects it (highlights) and opens its settings in the right column.
- **Right column (flexible width) — Live Canvas + Settings:** top two-thirds is a live-rendered preview of the public form exactly as an applicant will see it (scrollable); bottom third (or a slide-up panel when a field is selected) is the **Field Settings panel** for the currently-selected field: Label (text), Required (toggle), and — only for File Upload fields — a "Maps to document type" dropdown (Birth Certificate / Transfer Certificate / Previous Marksheet / Other), matching the `institute_documents`-style categorization used elsewhere.

---

## 7. Attendance

### 7.1 Overview

**Nav path:** Attendance → Overview
**Breadcrumb:** Attendance / Overview
**Page Title:** "Attendance Overview"
**Primary Button:** none — this is a monitoring screen; the one actionable item ("Send Reminder") lives per-row in the table instead.

- **Region 1 — Context controls:** a horizontal row directly under the header: Date picker (defaults today, left-aligned) + Branch/Class filter chips (right-aligned).
- **Region 2 — KPI Card Row:** 4 KPI Cards: Present %, Absent %, Late %, "Not Yet Marked" (this last card's number renders in `--color-danger` instead of the neutral default whenever it's non-zero and the current time is past a configurable cutoff, e.g. 10am — a deliberate visual escalation to surface classes that forgot to mark attendance).
- **Region 3 — Class-Section Table:** Class-Section, Teacher (name), Marked Status Badge (Marked/Not Marked), Present count, Absent count, Late count, `⋯` ("View Detail" → opens a read-only per-student roster for that section+date; "Send Reminder" → sends a push notification to the assigned teacher, only enabled while Marked Status = Not Marked).

**Secondary Tab within this screen (tab row directly under the Page Header, before Region 1):** **Daily Overview | Low Attendance Alerts**

### 7.2 Low Attendance Alerts (second tab of §7.1)

- **Filter Bar:** Branch, Class, Threshold override (default 75%, adjustable per view without changing the institute-wide setting).
- **Data Table columns:** Student (photo+name, click → §5.6 Attendance tab), Class-Section, Current Attendance % (Body-Emphasis, red if below threshold), Trend (small ▲/▼ arrow vs. last month), `⋯` — "Notify Parent" (quick-send a low-attendance alert), "View History".

### 7.3 Leave Approvals

**Nav path:** Attendance → Leave Approvals
**Breadcrumb:** Attendance / Leave Approvals
**Page Title:** "Leave Approvals"
**Tabs:** **Student Leave | Staff Leave** (both draw from `leave_applications`, filtered by `applicant_type`)

- **Filter Bar:** Status (chips: Pending default-selected / Approved / Rejected / Cancelled), Branch, Date Range.
- **Data Table columns:** Applicant (photo+name; for Student Leave shows the student, with "applied by [parent name]" in Caption beneath; for Staff Leave shows the staff member directly), Branch, Dates (start–end, with day-count computed and shown in Caption), Reason (truncated to one line, "more" expands inline), Status Badge, `⋯` — "Approve" / "Reject" (both open a small Confirmation Modal with an optional Review Note textarea before committing) / "View Full Application".
- The Pending count on the "Student Leave"/"Staff Leave" tab labels themselves show a small numeric badge (e.g. "Student Leave (4)"), and this same total mirrors the top-bar Approvals icon badge.

---

## 8. Academics

### 8.1 Assessments List

**Nav path:** Academics → Assessments
**Breadcrumb:** Academics / Assessments
**Page Title:** "Assessments"
**Primary Button:** "+ Create Assessment" → opens Side Drawer (below).

- **Filter Bar:** Branch, Class, Subject, Term, Marks Status (Draft/Published). Search right-aligned (by assessment name).
- **Data Table columns:** Name, Class, Subject, Term, Max Marks (right-aligned), Common Badge (small "Common" blue badge shown inline next to Name if `is_common_assessment = TRUE` — clicking it deep-links to that record's Common Test detail, §8.5), Date, Marks Status Badge (Draft gray / Published green), `⋯` — "View", "Publish Marks" (disabled once already published), "Edit".

**Create Assessment (Side Drawer)** — single column, short form (no accordion needed, ~7 fields): Name, Class (dropdown), Subject (dropdown), Term (dropdown/free text), Max Marks (number), Assessment Date (date picker), Academic Year (defaults current, editable). Footer: Cancel / "Create Assessment" (primary).

### 8.2 Common Tests

**Nav path:** Academics → Common Tests
**Breadcrumb:** Academics / Common Tests
**Page Title:** "Common Tests"
**Primary Button:** "+ Create Common Test" → opens the 4-step wizard below.

- **Filter Bar:** Status (All/Scheduled/In Progress/Results Pending/Published), Subject, Class.
- **Data Table columns:** Name, Subject/Class, Branches Participating (count, e.g. "5 of 6 branches"), Status Badge (Scheduled=gray, In Progress=amber, Results Pending=amber with a small clock icon, Published=green), Test Date/Window, `⋯` — "View", "Edit" (disabled once any branch has started submitting marks), "Cancel Test" (red, only enabled pre-Scheduled).

### 8.3 Create Common Test — Full-Page Wizard (4 Steps)

Uses the standard Full-Page Wizard chrome (§0.5): step indicator (Scope → Scheduling → Question Paper → Scoring), 720px centered body, sticky footer (Back / Next / final step "Create Common Test").

**Step 1 — Scope**
- H2 "What is this test for?" — Subject (dropdown), Class/Grade (dropdown).
- H2 "Which branches?" — a toggle "All Branches" (default ON) at the top; when toggled OFF, reveals a checkbox list of individual branches.
- Beneath the branch selection, **for each selected branch**, an expandable row appears: branch name + chevron → expands to a "Sections" checkbox sub-list (defaults to "All Sections" pre-checked, individual sections selectable if the admin unchecks "All").

**Step 2 — Scheduling**
- Radio group: "○ Same date & time for every branch" (reveals a single Date + Time picker) vs. "○ Each branch schedules within a date window" (reveals a Start Date + End Date range picker for the window).
- If the window option is chosen, beneath the range picker a **per-branch scheduling table** appears (one row per branch selected in Step 1): Branch Name, "Scheduled Slot" column showing either "Not yet set" (gray Caption) or the specific date/time the branch admin has picked — read-only here for the Institute Admin (branches set their own slot from their own side later), included so the Institute Admin can monitor readiness before test day.

**Step 3 — Question Paper**
- Radio group: "○ One shared paper (locked, identical for every branch)" — reveals a file-upload dropzone for the paper PDF, with a Caption note "This paper will be locked and non-editable per branch once uploaded." — vs. "○ Shared question bank, randomized per branch" — reveals a "Select Question Bank" searchable dropdown (existing banks by subject/class) plus a "Questions per paper" numeric field.

**Step 4 — Scoring & Weightage**
- Two independent toggle rows, each expandable when ON:
  - **"Counts toward report card"** toggle → reveals "Weightage" numeric field (%, with Caption "of the term's total assessment weight").
  - **"Counts toward leaderboard points"** toggle → reveals a radio sub-group for the points formula: "○ Flat points for participation" (numeric field) / "○ Percentage scored × weight" (numeric weight multiplier field) / "○ Rank-based bonus for top finishers" (a small inline table: Rank 1/2/3/4-10 with a points value per band, editable).
- Both toggles can be ON simultaneously (a test can count toward both, or either, or neither with an inline warning "This test won't affect grades or the leaderboard — confirm this is intentional" if both are left off).
- Final footer button label: **"Create Common Test"** (primary). On submit: generates the parent `common_tests` record plus per-branch `common_test_branches` rows and the underlying `assessments` rows per branch/section, then redirects to §8.5 Detail for the newly created test.

### 8.4 Common Test Detail

**Nav path:** Academics → Common Tests → [Test Name]
**Breadcrumb:** Academics / Common Tests / [Test Name]
**Page Title:** Test name, Status Badge inline.
**Secondary Button:** "Edit" (disabled once marks submission has begun, per §8.2 rule). **Overflow (⋯):** "Duplicate for Next Term", "Cancel Test" (red, conditionally enabled).

**Tabs:** **Overview | Branch Progress | Fairness Controls | Results**

- **Overview tab:** summary Card grid — Subject/Class, Branches count, Scheduling mode, Question paper mode, Weightage settings — essentially a read-back of the wizard's choices, each field with a small "Edit" pencil icon that deep-links back into the relevant wizard step if editing is still allowed.
- **Branch Progress tab:** the operational heart of this screen. Table: Branch Name, Status Pill (Not Started / In Progress / Marks Submitted — amber/blue/green respectively), Students Marked (fraction, e.g. "142 / 150"), Submitted At (timestamp once done). **Directly above this table, a conditional full-width Banner appears once every branch shows "Marks Submitted":** green-tinted background, text "All branches have submitted results." + a single prominent button **"Publish Results Now"** (primary, filled) inline within the banner itself — this makes the spec's simultaneous "Result Publication Gate" a single unmissable physical action rather than a background process the admin has to trust blindly.
- **Fairness Controls tab:** two sub-sections — (a) **Proctoring Parity** table: one row per branch, a dropdown per row (Online / Offline / Proctored) recording how that branch actually ran the test, so results can be footnoted later if conditions differed; (b) **Normalization** — a single institute-level toggle for this specific test ("Apply statistical normalization before awarding points") with a radio sub-choice (Z-score / Percentile-based) revealed when ON.
- **Results tab:** only populated after publication — a ranked table (Rank, Student, Branch, Score, Percentile, Points Awarded) with a Branch filter chip row above it and an "Export" Secondary button top-right.

### 8.5 Marks & Report Cards

**Nav path:** Academics → Marks & Report Cards
**Breadcrumb:** Academics / Marks & Report Cards
**Page Title:** "Marks & Report Cards"
**Tabs:** **Marks Oversight | Report Cards**

- **Marks Oversight tab:** Data Table — Assessment Name, Class-Section, Teacher, Students Marked (fraction), Publish Status Badge, `⋯` — "View Marks" (opens a read-only per-student marks table in a Side Drawer), "Publish" (enabled once fully marked; opens a Confirmation Modal: "Publishing makes these marks visible to parents immediately.").
- **Report Cards tab:** Data Table of `generated_documents` where type = report_card — Student, Class-Section, Academic Year/Term, Generated Date, `⋯` ("Download", "Regenerate"). **Primary Button (top-right, this tab only):** "Generate Report Cards" → opens a Modal: Class/Section selector + Term selector → "Generate" triggers a batch job shown via a progress Modal (progress bar + live count "Generating 84 of 150…") that converts to a success Toast on completion.

---

## 9. Communication

### 9.1 Circulars

**Nav path:** Communication → Circulars
**Breadcrumb:** Communication / Circulars
**Page Title:** "Circulars"
**Primary Button:** "+ New Circular" → opens the full-page composer (§9.1.1, below).

- **Filter Bar:** Scope (Institute-wide/Branch/Class — chip filter), Branch, Date Range. Search right-aligned (title text).
- **Data Table columns:** Title (Body-Emphasis, click → read-only preview Modal), Scope Badge (e.g. "Institute-wide" dark-blue / "[Branch Name]" gray / "[Class-Section]" light-gray), Posted By, Date, Read-Receipt (a small horizontal progress bar + percentage, e.g. "▓▓▓▓▓▓░░░░ 64%"), `⋯` — "View", "Duplicate", divider, "Delete" (red).

**9.1.1 New Circular — Full-Page Composer** (not a drawer — deliberately full-page since it combines rich text + targeting + channel selection, too much for a 480px drawer)

- **Page Title:** "New Circular". **Primary Button area replaced by a 3-button footer cluster** (sticky bottom bar, right-aligned): "Save as Draft" (secondary) / "Schedule" (secondary, opens an inline date-time picker popover when clicked, then the button label updates to show the scheduled time) / "Send Now" (primary, filled).
- **Body, two-column:** Left column (flexible, ~65% width) — Title (text input, large), Body (rich-text editor: bold/italic/bullet/link toolbar, 300px min height), Attachment (drag-drop zone beneath the editor, shows uploaded file chips with remove ✕). Right column (fixed 320px, sticky) — **Targeting panel** (Card): Scope radio (Institute-wide / Specific Branch(es) / Specific Class Sections — the latter two reveal a multi-select tree beneath), and beneath a divider, **Channels panel**: checkboxes for Push (always checked, disabled — it's the free default channel), SMS, WhatsApp — each paid channel shows a small Caption cost-estimate ("~₹0.35/recipient") that updates live based on the current targeting selection's audience size shown at the top of this panel ("Estimated reach: 1,240 recipients").

### 9.2 Templates

**Nav path:** Communication → Templates
**Breadcrumb:** Communication / Templates
**Page Title:** "Message Templates"
**Primary Button:** "+ New Template" → Side Drawer: Template Name, Type (dropdown: Absence/Fee Reminder/Low Attendance/Custom), Body (textarea with a small toolbar row above it offering variable-chip inserts like `{{student_name}}`, `{{amount_due}}`, `{{date}}` — clicking a chip inserts it at the cursor). Footer: Cancel / "Save Template".
- **Data Table columns:** Template Name, Type Badge, Last Edited, `⋯` — "Edit", "Duplicate", "Delete" (red).

---

## 10. Fees

### 10.1 Fee Structure

**Nav path:** Fees → Structure
**Breadcrumb:** Fees / Structure
**Page Title:** "Fee Structure"
**Primary Button:** "+ Add Fee Component" → Side Drawer: Class (dropdown, or "All Classes"), Fee Head (text, e.g. "Tuition Fee"), Amount, Frequency (One-time/Recurring — Recurring reveals a cadence dropdown: Monthly/Quarterly/Annual), Applicable Branch(es) (multi-select, or "All Branches").
- **Tabs (this screen has 3, sharing the Primary Button context which changes per tab):** **Fee Components | Discounts & Scholarships | Installment Plans**
- **Fee Components tab table:** grouped visually by Class (collapsible group headers) — Fee Head, Amount, Frequency Badge, Branch(es), `⋯` (Edit/Delete).
- **Discounts & Scholarships tab:** table — Discount Name (e.g. "Sibling Discount", "RTE Quota"), Type (Percentage/Flat), Value, Eligibility Rule (Caption description), `⋯`. Primary Button here becomes "+ Add Discount Rule".
- **Installment Plans tab:** table — Plan Name, # Installments, Applicable Fee Heads, `⋯`. Primary Button here becomes "+ Add Installment Plan" → Drawer with a dynamic repeating row group (Installment #, Due Date offset, % of total) with "+ Add Installment" link to append rows.

### 10.2 Collections

**Nav path:** Fees → Collections
**Breadcrumb:** Fees / Collections
**Page Title:** "Fee Collections"
**Secondary Button (top-right):** "Defaulter Report" (exports the currently-filtered overdue list to PDF/Excel).

- **Region 1 — KPI Card Row:** Collected This Month (₹), Pending (₹), Overdue (₹ + count, rendered in `--color-danger`).
- **Filter Bar:** Branch, Class, Status (chips: Paid/Partial/Overdue), Search (student name/admission number).
- **Data Table columns:** Student (photo+name, click → §5.6), Class-Section, Amount Due, Due Date, Status Badge, `⋯` — "View Receipt" (opens PDF preview Modal), "Send Reminder" (uses the fee-reminder Template from §9.2), "Record Manual Payment" (opens a small Modal: Amount, Mode dropdown [UPI/Card/Net Banking/Cash], Reference No.).

---

## 11. Timetable

**Nav path:** Timetable
**Breadcrumb:** Timetable
**Page Title:** "Timetable"
**Tabs:** **Setup | Timetable | Exam Schedule | Academic Calendar**

### 11.1 Setup tab
Three sections, all timetable-specific and genuinely non-duplicated:
1. **Working days** - Checklist for active days (e.g. Mon-Sat).
2. **Daily period structure** - Definition of period times, including marking breaks as non-teaching.
3. **Subject scheduling rules** - Subject names pulled live from Academic Structure (read-only names). Each has inline toggles: "needs a double period", "requires a specific room" (dropdown), and "allow twice per day". No create/edit/delete of the subject itself here. Shows a hint: "Subject not found? [Add it in Academic Structure ->]"

### 11.2 Teachers tab
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

### 11.3 Exam Schedule tab
- Standard Data Table: Assessment Name, Date, Time, Branch/Room, `...` (Edit/Delete). Primary Button: "+ Add Exam Slot".

### 11.4 Academic Calendar tab
- Month-view calendar (standard month grid, 7 columns), events rendered as small colored bars on their date cell (color per event type: Holiday=gray, Exam=blue, PTM=purple, Common Test=amber - small legend beneath the calendar).
- Primary Button: "+ Add Calendar Event" -> Modal: Event Name, Type (dropdown), Date (or date range for multi-day holidays), Branch(es) scope (All/Specific).
- Month navigation (< Month Year >) centered above the grid.

---

## 12. Gamification

Kept as its own top-level sidebar group (not nested under Academics) since it spans academic and non-academic point categories and carries its own governance model (§4.4's two-person rule references this module directly).

### 12.1 Points & Categories

**Nav path:** Gamification → Points & Categories
**Breadcrumb:** Gamification / Points & Categories
**Page Title:** "Points & Categories"
**Tabs:** **Categories | Activity Types**

- **Categories tab:** rendered as a **Card grid** (not a table — categories are few and visually distinct, so cards read better), 4 per row on desktop, each Category Card: large icon (top, 32px), Category Name (H3), description (Caption, 1 line), a small badge in the top-right corner of the card reading "Platform Default" (gray, non-removable) for the 7 seeded categories or nothing extra for institute-added ones, `⋯` in the card's corner for institute-added categories only (Edit/Delete — platform-default categories have no `⋯` at all, since they can't be edited, rather than showing a disabled one). Primary Button: "+ Add Category" → Modal (Name, Description, Icon picker — small grid of icon choices).
- **Activity Types tab:** Data Table — Name, Category Badge, Default Points (right-aligned), Award Mode Badge ("Manual" or "Auto"), Max Frequency (Caption, e.g. "1× per week" or "—" if uncapped), Active toggle, `⋯` (Edit/Delete). Primary Button: "+ Add Activity Type" → Drawer: Name, Category (dropdown), Default Points (number), "Requires manual award" (toggle — when OFF, a Caption note appears: "This activity's points will be generated automatically by the system, e.g. from assessment results."), and — only visible when manual-award is ON — "Maximum frequency" (a compound field: number + unit dropdown [per day/per week/per month/per term], optional, Caption: "Prevents repeated awards from inflating one student's ranking.").

### 12.2 Batch Catalog

**Nav path:** Gamification → Batch Catalog
**Breadcrumb:** Gamification / Batch Catalog
**Page Title:** "Batch Catalog"
**Primary Button:** "+ Create Batch" → Side Drawer (below).

- **Layout:** collapsible section groups (accordion, multiple can be open at once here since batches are meant to be browsed, unlike the sidebar's single-open rule) matching the spec's taxonomy, each group a Micro-style header with a chevron and a count: **Academic Performance (6) · Cross-Category / Overall (6) · Sports (4) · Tiered — Bronze/Silver/Gold (per category) · Special / Rare (3)**.
- **Within each group:** a Card grid, 4 per row, each **Batch Card**: badge icon (48px, top-center), Batch Name (H3, centered), Category tag (small Badge beneath name, or "Cross-Category" gray tag if `category_id` is NULL), Validity Period pill (Termly/Monthly/Annual/Permanent, bottom-left of card), Active/Inactive dot (bottom-right).
- **Sensitive batch marker:** any batch flagged sensitive (e.g. "Comeback Batch") additionally shows a small 🔒 tag directly beneath the badge icon reading "Admin-only visibility" in `--color-locked` text — a constant, unmissable reminder baked into the card itself so no admin can toggle it public without first seeing this label.
- **Card click** → Batch Detail (Side Drawer): Criteria Type (Points Threshold / Rank Threshold / Manual — shown read-only as the type, with the specific `criteria_value` beneath, e.g. "Top 10" or "60 points"), Bonus Points on Award, Validity Period, Category, Active toggle, and — only for the sensitive-flagged batches — a locked, non-editable "Visibility: Admin, Student & Parent only — never public leaderboard" statement instead of a normal visibility control, to make the rule structurally uneditable rather than just defaulted.

**Create Batch (Side Drawer):** Name, Description, Category (dropdown, or "Cross-Category / None"), Badge Icon (icon picker), Criteria Type (radio: Points Threshold / Rank Threshold / Manual Award — selecting Points or Rank Threshold reveals a numeric "Criteria Value" field with contextual Caption: "points needed" or "rank cutoff, e.g. 10 = top 10"), Validity Period (dropdown), Bonus Points on Award (number), "Mark as sensitive / admin-only visibility" (toggle, off by default — turning it on shows an inline confirmation note: "This batch will never appear on a public or classmate-visible leaderboard.").

### 12.3 Leaderboards

**Nav path:** Gamification → Leaderboards
**Breadcrumb:** Gamification / Leaderboards
**Page Title:** "Leaderboards"
**Tabs:** **Live Preview | Privacy Settings**

- **Live Preview tab:** a **Filter Bar** with the full composable filter set named in the spec — Scope (Class/Section, Class-Grade, Subject, Branch, Institute, Network, Batch/Badge, Most-Improved — dropdown), Branch, Class/Grade, Section, Subject, Point Category, Time Period (Weekly/Monthly/Termly/Annual/All-time), Batch Type (conditional, only shown when Scope = Batch/Badge). Beneath it, a read-only ranked Data Table: Rank (#, with 🥇🥈🥉 icons for top 3), Student (photo+name+branch, anonymized to "Rank only" per §12.3's Privacy Settings if the current Academic-Year/grade combination is below the configured anonymize threshold — this preview deliberately renders exactly what a parent *would* see under current settings, so the admin can self-check), Points (right-aligned), Batches earned (small icon count).
- **Privacy Settings tab:** single Card, vertical settings rows (label+description left, control right, matching the §4.4 Governance pattern for consistency):
  1. **"Allow parent visibility"** — toggle, OFF by default. When ON, reveals: **"Parent view scope"** — radio ("My child's rank + top 10 only" / "Full leaderboard").
  2. **"Anonymize below grade"** — numeric input (e.g. "4" → Grade 4 and below show rank position without names), Caption: "Reduces social pressure for younger students while keeping the motivational ranking."
  3. **"Allow students to opt out of public display"** — toggle. Caption: "Points, batches, and rank still exist for the school's own records and report cards even when a student opts out of public visibility."
  4. **"Show names on network leaderboard"** — toggle, relevant only once a partnership is Active (§13); shown grayed with Caption "Enable a cross-institute partnership first" if none is active yet, rather than hidden entirely.
  - Footer: "Save" (primary, bottom-right of the Card) + a small Caption line beneath: "Changes here are recorded in the Audit Log."

---

## 13. Network (Cross-Institute Partnerships)

### 13.1 Partnerships List

**Nav path:** Network → Partnerships
**Breadcrumb:** Network / Partnerships
**Page Title:** "Partnerships"
**Primary Button:** "+ Request Partnership" → Side Drawer (below).

- **Region 1 — "Awaiting your response" section** (only rendered when incoming pending requests exist; sits directly beneath the Page Header, above the main table, in a distinctly highlighted Card with a `--color-warning`-tinted left border): each incoming request as a row — Requesting Institute Name + logo, Requested Scope (Caption, e.g. "All Students" or "Grade 10 only"), Requested Date, and **inline** `Accept` (primary, small) / `Decline` (secondary, small) buttons directly on the row — no drill-in required, since responding is the single most time-sensitive action on this whole screen.
- **Region 2 — Main Data Table** (all partnerships, any status): Partner Institute (name+logo), Status Badge (Pending amber / Active green / Declined red / Withdrawn gray), Scope, Requested Date, `⋯` — "View Details", and conditionally "Withdraw" (red, only shown on Active rows — opens a Confirmation Modal explicitly stating: "Historical results stay visible. Your students will stop appearing in future shared leaderboards immediately.").
- **Region 3 — Network Leaderboard Preview** (Card, beneath the main table): a read-only embed of the same leaderboard table component from §12.3, pre-filtered to Scope = Network, with a Caption note above it: "Preview of the shared network leaderboard, as it appears once this institute has at least one active partnership."

**Request Partnership (Side Drawer):** Search Partner Institute (searchable select by name/code), Scope (radio: All Students / Specific Grades / Specific Subjects — the latter two reveal a multi-select beneath), footer Cancel / "Send Request" (primary). On submit: Toast "Partnership request sent to [Institute Name]" and the new row appears in the main table with status Pending.

---

## 14. Reports & Analytics

### 14.1 Report Gallery (landing screen)

**Nav path:** Reports & Analytics
**Breadcrumb:** Reports & Analytics
**Page Title:** "Reports & Analytics"
**Secondary Tab within header row:** **Report Gallery | Custom Report Builder**

- **Report Gallery tab:** a Card grid, 3 per row, each **Report Card** (180px tall): Report Name (H3, top), a small embedded sparkline/mini-chart (60px tall, purely decorative preview of the underlying trend), "Open →" text-link bottom-right. Six cards, fixed set: **Attendance Trends · Academic Performance · Fee Collection · Admissions Conversion · Staff Attendance · Leaderboard & Gamification Engagement**.

### 14.2 Report Detail (opens on Report Card click)

**Breadcrumb:** Reports & Analytics / [Report Name]
**Page Title:** [Report Name]
**Secondary Button (top-right):** "Export PDF/Excel" (opens a small format-choice Modal before downloading).

- **Filter Bar:** Branch, Class (where applicable), Date Range — consistent placement across every report for muscle-memory.
- **Region 1 — Chart:** large chart area (400px tall), a small segmented toggle top-right of the chart itself for Line/Bar view where both are meaningful (e.g. Attendance Trends); single fixed chart type for reports where a toggle wouldn't add value (e.g. Admissions Conversion stays a funnel).
- **Region 2 — Data Table:** beneath the chart, the same data in tabular form (sortable columns matching the chart's dimensions), for admins who want exact numbers rather than reading a chart.

### 14.3 Custom Report Builder

**Breadcrumb:** Reports & Analytics / Custom Report Builder
**Page Title:** "Custom Report Builder"
- **Layout:** left column (280px) — a field picker organized by module (drag fields like "Attendance %", "Fee Collected", "Points Earned" onto a canvas); right column — live preview of the resulting table/chart as fields are added, with a "Save Report" Primary Button (top-right of Page Header) that adds the resulting custom report as a new card back in §14.1's gallery under a "Custom" section.
- If this capability isn't yet built, the entire screen instead shows a centered Empty-State-style placeholder: icon, "Custom Report Builder — Coming Soon", one line of explanatory Caption text, no button (this keeps the sidebar entry truthful without hiding the roadmap item).

---

## 15. Audit Log

**Nav path:** Audit Log
**Breadcrumb:** Audit Log
**Page Title:** "Audit Log"
**Primary Button:** none. **Secondary Button (top-right):** "Export CSV".

This screen is intentionally the most utilitarian, dense, unstyled-relative-to-others screen in the product — its job is fast scanning by someone investigating something, not delight.

- **Filter Bar:** User (searchable select), Action Type (dropdown, e.g. `role.create`, `marks.publish`, grouped by module), Entity Table (dropdown), Date Range. Search box for free-text across action/entity.
- **Data Table columns** (dense row height, 52px instead of the standard 56px, per §0.5's dense-table note): Timestamp (absolute, not relative — precision matters here), User (avatar+name), Action (Caption/monospace-style, e.g. `role.create`), Entity (table name + short ID, e.g. "roles · a1b2…"), IP Address (Caption), a trailing chevron to expand.
- **Row expand** (click the chevron or anywhere on the row): reveals an inline panel beneath the row, full-width, showing a **side-by-side JSON diff** — "Before" (left, `old_values`) vs "After" (right, `new_values`), with changed keys highlighted in a light amber background and unchanged keys shown de-emphasized in gray, so the specific delta is instantly visible without reading a full JSON blob.

---

## 16. Compliance & Consent

**Nav path:** Compliance & Consent
**Breadcrumb:** Compliance & Consent
**Page Title:** "Compliance & Consent"
**Tabs:** **Consent Records | Data Policy Settings**

- **Consent Records tab:** read-only Data Table (no create/edit actions anywhere on this tab — deliberately, consent records are only ever written by the actual consent-capture flow in §5.5, never hand-edited): Student (photo+name), Parent (name), Consent Type Badge (Data Processing / Photo Usage / Leaderboard Display), Consented (✓ green / ✗ red icon, not a togglable control), Consent Text Version, Date. Search by student name.
- **Data Policy Settings tab:** a settings form, matching the §4.4/§12.3 pattern for consistency:
  1. **"Auto-archive student records after graduation"** — numeric field, "___ years after graduation", Caption: "Retention period for compliance with data-minimization requirements."
  2. **"Current consent language version"** — read-only display of the active version string + a "View current consent text" link (opens the exact text shown to parents at onboarding, in a read-only Modal) — no inline-edit here since changing consent language is a legal/versioned action, deliberately routed to a separate controlled flow rather than a casual text field.
  3. **"Data deletion requests"** — a small entry-point row: "Request Data Deletion" Secondary button, opens a guarded multi-step Modal (search student → confirm identity match → explicit typed confirmation "DELETE" before submitting) — the friction here is intentional, matching this screen's stated design rule of no bulk-edit or casual delete controls anywhere in this module.

---

## 17. Subscription & Plan

**Nav path:** Subscription & Plan
**Breadcrumb:** Subscription & Plan
**Page Title:** "Subscription & Plan"
**Primary Button:** "Upgrade Plan" (top-right) — opens a contact/upsell flow (Modal with a short "Tell us what you need" form that routes to the platform's sales/support queue), not a self-service downgrade or plan switch, consistent with the platform-owner-controlled billing model in the schema.

- **Region 1 — Current Plan Card:** Plan Name (H2), price basis (Caption, e.g. "₹X per student / year"), a checklist of included features (✓ rows), Max Branches / Max Students shown as two small stat chips.
- **Region 2 — Usage Card:** two horizontal progress bars — "Students: 1,240 / 1,500" and "Branches: 4 / 5" — bars render amber past 85% utilization and red past 100% (over-limit, grandfathered) to visually flag when an upgrade conversation is becoming necessary.
- **Region 3 — Billing History Table:** Date, Amount, Status Badge (Paid/Due), Invoice (a small download-icon button per row) — read-only, no edit actions.

---

## 18. Appendix A — Full Sidebar-to-Screen Map

```
🏠 Dashboard
🏢 Institute Setup
   ├─ Branches ─────────────► List → Detail (tabs: Overview/Staff/Students/Class Sections/Overrides) → Add/Edit Drawer
   ├─ Academic Structure ───► Tabs: Academic Years / Classes / Subjects
   └─ Branding & Profile ───► Single scrollable form, sticky-nav sections
🔑 Roles & Permissions
   ├─ Role Builder ─────────► List (All/System/Institute-wide/Branch-scoped) → 3-Step Wizard (Basics/Matrix/Review)
   ├─ Assignments ──────────► List → Assign Role Drawer
   └─ Governance Settings ──► Single settings form
👥 People
   ├─ Staff ─────────────────► List → Profile (tabs) → Invite Drawer
   ├─ Students ──────────────► List → Profile (tabs) → Add Drawer / Bulk Import flow
   └─ Parents ───────────────► List → Link Existing Modal
📥 Admissions CRM
   ├─ Enquiries ─────────────► Board/List toggle → Detail Drawer
   ├─ Funnel Report ─────────► Funnel + Compare Branches toggle
   └─ Form Builder ──────────► Field palette + live canvas
✅ Attendance
   ├─ Overview ──────────────► Tabs: Daily Overview / Low Attendance Alerts
   └─ Leave Approvals ───────► Tabs: Student Leave / Staff Leave
📚 Academics
   ├─ Assessments ───────────► List → Create Drawer
   ├─ Common Tests ──────────► List → 4-Step Wizard → Detail (tabs: Overview/Branch Progress/Fairness/Results)
   └─ Marks & Report Cards ──► Tabs: Marks Oversight / Report Cards
📢 Communication
   ├─ Circulars ─────────────► List → Full-page Composer
   └─ Templates ─────────────► List → Drawer
💳 Fees
   ├─ Structure ─────────────► Tabs: Fee Components / Discounts / Installment Plans
   └─ Collections ───────────► List → Reminder / Manual Payment Modal
🗓️ Timetable ───────────────► Tabs: Weekly Grid / Exam Schedule / Academic Calendar
🏆 Gamification
   ├─ Points & Categories ───► Tabs: Categories / Activity Types
   ├─ Batch Catalog ─────────► Grouped card gallery → Detail Drawer
   └─ Leaderboards ──────────► Tabs: Live Preview / Privacy Settings
🌐 Network
   └─ Partnerships ──────────► Incoming requests + List → Request Drawer
📊 Reports & Analytics ─────► Gallery → Report Detail / Custom Builder
🧾 Audit Log ────────────────► Dense filterable table w/ inline JSON diff
🛡️ Compliance & Consent ────► Tabs: Consent Records / Data Policy Settings
⚙️ Subscription & Plan ─────► Current Plan / Usage / Billing History
```

---

## 19. Appendix B — Interaction & State Matrix

Applies uniformly across every screen above; documented once so individual screens didn't need to repeat it.

| State | Standard treatment |
|---|---|
| **Loading (initial page load)** | Skeleton placeholders matching the eventual layout's shape (gray animated blocks for KPI cards, table rows, card grids) — never a centered spinner alone on data-heavy screens, since it collapses layout and causes a jarring pop-in once data arrives. |
| **Loading (in-place action, e.g. saving a form)** | Primary Button switches to its loading state (§0.5); the rest of the screen remains interactive-looking but is not — a thin top-of-viewport progress bar also activates for actions expected to take >1s. |
| **Empty (no data yet)** | Standard Empty State component (§0.5) — icon + one-sentence explanation + the screen's Primary Button repeated. |
| **Empty (filtered to nothing)** | A lighter variant: no icon, just "No results match your filters." + a "Clear filters" text-link — distinguished from the true-empty state so users understand it's their filter choice, not a lack of underlying data. |
| **Error (failed to load)** | A centered inline banner within the content area (not a full-page takeover): warning icon, "Something went wrong loading this page.", "Retry" button. |
| **Error (form validation)** | Inline, beneath the specific field, Caption-size, `--color-danger`, appears on blur or failed submit — never a single generic banner that doesn't say which field is wrong. |
| **Error (failed save/submit)** | Toast in `--color-danger` styling (dark-red background variant of the standard Toast) with the specific reason if known ("Role name already exists") — persists 6s instead of the standard 4s, since it needs to be read and acted on. |
| **Success (async action completed)** | Standard Toast (§0.5), 4s auto-dismiss, non-blocking. |
| **Destructive action confirmation** | Always a Confirmation Modal (§0.5) — never a browser-native `confirm()`, and never a single-click destructive button anywhere in the product. |
| **Unsaved changes on navigation-away** | A Confirmation Modal specific to this case: "You have unsaved changes. Leave anyway?" with "Stay" (secondary) / "Leave" (red) — triggered when closing a dirty Drawer/Wizard via the ✕, browser back, or sidebar navigation. |
| **Permission-denied (least-privilege)** | Never a hidden control — always visible-but-disabled with a Tooltip explaining why (see §4.2's locked-permission pattern), so users understand the system's boundaries rather than wondering if a feature is missing. |
| **Read-only historical data view** | The amber "Viewing [Year] — historical, read-only" banner (§1.3) plus every Primary/Secondary action button on the screen switches to disabled state with a shared tooltip: "Switch to the current academic year to make changes." |

---

## 20. Appendix C — Accessibility Notes

- **Color is never the only signal.** Every Status Badge pairs its color with text (not a bare colored dot); every trend arrow pairs color with a ▲/▼ glyph; the locked-permission state pairs gray with an explicit 🔒 icon and tooltip text.
- **Contrast:** all text/background pairings in §0.2 meet WCAG AA (4.5:1 for body text, 3:1 for large/Display text) at the specified hex values.
- **Focus states:** every interactive element (buttons, table rows, dropdown triggers, checkboxes) shows a visible 2px `--color-primary` focus ring on keyboard navigation, distinct from the hover state.
- **Keyboard operability:** all Drawers/Modals trap focus while open and return focus to the triggering element on close; the `/` global-search shortcut and `Esc`-to-close on any Drawer/Modal are supported everywhere.
- **Table row actions:** the `⋯` overflow menu is reachable and operable via keyboard (Tab to the row, Enter/Space to open the menu, Arrow keys to navigate items) — not mouse-hover-only.
- **Form labels:** every input has a visible, persistent label above it (not placeholder-as-label), since placeholder text disappears on input and fails screen-reader association in several assistive-tech configurations.
- **Alt text:** student/staff photos use the person's name as alt text; decorative icons (module icons, badge icons) are marked decorative/aria-hidden so screen readers don't announce redundant icon names on top of adjacent text labels.

---

*End of Institute Admin specification. Companion documents to follow using the same Section 0 design system and Section 1 navigation-shell conventions: Teacher/Staff login screens, and Parent login screens — so all three roles present as one coherent product rather than three separately-designed apps.*
