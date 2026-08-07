---
version: alpha
name: CampusOne Institute Admin
summary: "Calm, trustworthy, data-dense institutional administration UI for a multi-branch school CRM."
colors:
  primary: "#2E5AAC"
  primary-hover: "#24478A"
  surface: "#FFFFFF"
  canvas: "#F5F7FA"
  border: "#E2E6EC"
  text-primary: "#1A1F2B"
  text-secondary: "#5B6472"
  text-disabled: "#A6ADB8"
  success: "#1E8E5A"
  warning: "#B7791F"
  danger: "#C4362E"
  info: "{colors.primary}"
  info-background: "#EAF0FB"
  locked: "#8B93A1"
  on-primary: "#FFFFFF"
  toast-surface: "{colors.text-primary}"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0em"
  h2:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
  h3:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  body-emphasis:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0em"
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  button: 8px
  card: 12px
  pill: 999px
spacing:
  unit: 4px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 40px
  4xl: 48px
  5xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-emphasis}"
    rounded: "{rounded.button}"
    padding: 10px 16px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-emphasis}"
    rounded: "{rounded.button}"
    padding: 10px 16px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-emphasis}"
    rounded: "{rounded.button}"
    padding: 10px 16px
  button-destructive-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.body-emphasis}"
    rounded: "{rounded.button}"
    padding: 10px 16px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: 20px
  badge:
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
---

## Overview

This is the mandatory design contract for CampusOne’s Institute Admin web experience. Read and follow this document before designing, creating, editing, or reviewing any component, screen, route, feature, or responsive state.

The product must feel like one coherent, calm, trustworthy institutional system across its 16 administrative modules—not a collection of independently styled pages. It is information-rich without being visually noisy. Prefer clear hierarchy, predictable placement, progressive disclosure, restrained elevation, and explicit safety feedback over visual novelty.

### Agent rules — mandatory

1. Use existing semantic design tokens only. **Never hardcode a color** in JSX/TSX/HTML/CSS, inline styles, SVG fill/stroke, chart configuration, tests, or component-specific styles.
2. Literal color values are permitted only in the central token-definition source that implements this document. Components consume token references, e.g. `var(--color-primary)`, a theme accessor, or semantic token object—not hex, RGB, HSL, named colors, or arbitrary Tailwind color utilities.
3. Never introduce a new color token to solve a local screen need. First use the semantic token already defined. If genuinely necessary, add a named semantic token centrally, document its usage and contrast, then use it by reference.
4. Do not import or copy styling from Parent or Staff products. This file defines the shared visual language; each product owns its own screens and feature implementation.
5. Build reusable primitives first. A screen may compose primitives and feature-local components; it must not recreate a button, table, drawer, badge, modal, filter bar, or form field with ad hoc styles.
6. Preserve the exact interaction hierarchy: one Primary Button per normal screen, at the Page Header’s top right; a Secondary Button immediately to its left only when needed; destructive actions stay in overflow or a confirmation modal.
7. Every data mutation requires loading, success, failure, validation, permission, and unsaved-change states defined below. No happy-path-only UI.
8. Follow all dimensions, breakpoints, accessibility, and responsive rules in this file unless a screen-level requirement explicitly overrides them.

### Design intent

- **Institutional:** deep blue establishes responsible, professional administration.
- **Calm:** canvas background, white bordered surfaces, and shadows only on hover keep dense information readable.
- **Safe:** clear role/permission locks, confirmations for destructive actions, visible read-only context, and audit-friendly detail.
- **Efficient:** stable shell, standard list pattern, consistent filters, tables, and drawers minimize relearning.
- **Accessible:** no meaning is conveyed by color alone; all controls are keyboard-operable and have visible focus.

## Colors

### Canonical semantic tokens

Implement the central theme with the following CSS-compatible aliases. The values above are the source palette; all component and feature styles must reference aliases rather than values.

```css
:root {
  --color-primary: var(--token-color-primary);
  --color-primary-hover: var(--token-color-primary-hover);
  --color-surface: var(--token-color-surface);
  --color-canvas: var(--token-color-canvas);
  --color-border: var(--token-color-border);
  --color-text-primary: var(--token-color-text-primary);
  --color-text-secondary: var(--token-color-text-secondary);
  --color-text-disabled: var(--token-color-text-disabled);
  --color-success: var(--token-color-success);
  --color-warning: var(--token-color-warning);
  --color-danger: var(--token-color-danger);
  --color-info: var(--token-color-info);
  --color-info-background: var(--token-color-info-background);
  --color-locked: var(--token-color-locked);
  --color-on-primary: var(--token-color-on-primary);
  --color-toast-surface: var(--token-color-toast-surface);

  /* Derived semantic surfaces: derive centrally, never inline. */
  --color-primary-subtle: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
  --color-info-subtle: color-mix(in srgb, var(--color-info) 10%, var(--color-surface));
  --color-success-subtle: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
  --color-warning-subtle: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
  --color-danger-subtle: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface));
  --color-neutral-subtle: var(--color-canvas);
  --color-scrim: color-mix(in srgb, var(--color-text-primary) 40%, transparent);
  --color-focus-ring: var(--color-primary);
}
```

If browser support prevents `color-mix`, define the resulting values as named central tokens in the theme file. Do not calculate or paste them in components.

### Token usage rules

| Token | Use only for |
|---|---|
| `--color-primary` | Primary buttons, active navigation indicator, links, focus rings, current wizard step, active tabs, informational identity |
| `--color-primary-hover` | Hover/pressed primary-button state only |
| `--color-surface` | Cards, tables, drawers, modals, top bar, sidebar, form surfaces |
| `--color-canvas` | Application/page background, table headers, row hover, neutral low-emphasis backgrounds |
| `--color-border` | Table/card/form borders, dividers, sticky-footer separators |
| `--color-text-primary` | Headings, body content, toast background; never substitute a local near-black |
| `--color-text-secondary` | Helper text, labels, breadcrumbs, timestamps, muted content |
| `--color-text-disabled` | Disabled text/fields only |
| `--color-success` | Active, approved, verified, published, positive trend; pair with text/icon |
| `--color-warning` | Pending, draft, in progress, near-limit, historical read-only alert; pair with text/icon |
| `--color-danger` | Rejected, inactive, overdue, destructive actions, field errors; pair with text/icon |
| `--color-info` / `--color-info-subtle` | Informational banner and non-error contextual help |
| `--color-locked` | Disabled permission controls and lock explanations only |

### Status mapping

- Green/success: Active, Approved, Published, Verified, Marked complete.
- Amber/warning: Pending, Draft, In Progress, Results Pending, near a plan limit, historical year warning.
- Red/danger: Inactive, Rejected, Overdue, Withdrawn, failed validation, destructive confirmation.
- Neutral/canvas: Archived, Not Applicable, platform-default/reference-only status.

A status always has text. Trend indicators additionally have ▲ or ▼. Locked controls additionally have a lock icon and explanatory tooltip.

### Charts and data visualization

Charts may not introduce literal palette values. Create central semantic chart tokens such as `--color-chart-primary`, `--color-chart-secondary`, `--color-chart-tertiary`, and event-type tokens as aliases/approved extensions of the semantic system. Provide a text legend and do not rely on color alone. Branch comparison, funnels, charts, progress bars, and calendar events use these chart/event tokens only.

## Typography

Use one humanist sans-serif family throughout: Inter (or a metrically compatible approved replacement) with system fallbacks. Do not use a display font, serif accent, or module-specific font.

| Style | Token | Usage |
|---|---|---|
| Display | `typography.display` | Single page title at top-left of Page Header; 28px/700 |
| H2 | `typography.h2` | Internal sections, card group headings, drawer headings; 20px/600 |
| H3 | `typography.h3` | Card titles, modal titles, table column-group headers; 16px/600 |
| Body | `typography.body` | Table cells, inputs, copy; 14px/400 |
| Body Emphasis | `typography.body-emphasis` | Names/primary table values, active filter labels; 14px/600 |
| Caption | `typography.caption` | Helpers, timestamps, badge text, breadcrumb; 12px/400 |
| Micro | `typography.micro` | Uppercase table headers/eyebrows; 11px/500, 0.04em letter spacing |

Rules:

- One Display title per screen only.
- Maintain visible labels above all inputs; placeholders never replace labels.
- Use Body Emphasis to establish the first-readable value in a row/card, not as general bold decoration.
- Use Caption for supporting data, not critical instructions or errors that must be readable at Body size.
- Use Micro uppercase only for compact metadata, table headers, and section eyebrows.

## Layout

### Desktop grid and content frame

- Reference canvas: 1440px wide, 12 columns, 24px gutters, 32px left/right outer margins.
- Top bar: fixed/sticky, 64px high, full width.
- Sidebar: 240px expanded, 64px collapsed icon rail.
- Main content: 32px top + left/right padding, 40px bottom padding; maximum content width 1280px centered on ultrawide screens.
- Use 32px between major dashboard regions; 24px between distinct content blocks; 16px between tightly associated controls; 12px or 8px inside components; 4px only for micro-label adjacency.

### Responsive breakpoints

| Breakpoint | Required behavior |
|---|---|
| Desktop `>1024px` | Full sidebar if user selected it; normal grid and tables. |
| Tablet `≤1024px` | Sidebar auto-collapses to 64px on load; user may expand temporarily. Content padding is 24px. Branch Switcher and Academic Year merge into a single Context button/bottom sheet. |
| Mobile `≤768px` | Sidebar becomes off-canvas drawer opened by a burger icon. Content padding is 16px. Search becomes an icon opening full-screen search. Multi-column content stacks. KPI rows become horizontal swipe carousels. Tables become label:value mini-cards, never horizontally scrolled. Wizards become full screen and show textual `Step X of Y` rather than dot steps. |

### Global shell

#### Top bar — fixed 64px

From left to right:

1. **Sidebar control:** 32×32px collapse toggle, 16px from viewport edge. On mobile this becomes the burger control.
2. **Institute identity:** 32×32 logo and Body Emphasis display name, 16px gap after toggle; truncate name at 180px. Click goes to Dashboard. In icon-rail mode render logo only.
3. **Branch Switcher:** 180px trigger; menu width 240px; searchable; `All Branches` pinned first then divider then alphabetical branches; optional pending-item dot. Selection scopes every screen globally.
4. **Academic Year:** 120px trigger; most-recent/current default; changing to historical data creates a persistent read-only banner across all screens.
5. **Global Search:** flexible center field (minimum 320px, expands to 480px on focus), `/` shortcut. Search students, staff, roles, circulars. Its 480px result card has up to three results in Students, Staff, Roles, and Circulars groups, with `See all N results`; empty query shows five recently viewed items.
6. **Approvals:** 32×32 icon, numeric badge; pending leave, two-person awards, institute documents, and partnership actions. It opens grouped approval counts/review links or routes directly if only one category has items.
7. **Notifications:** 32×32 bell with count badge, opens Notification Drawer.
8. **Profile avatar:** 32×32 circular trigger, 16px from right edge. Right cluster has 12px gaps.

#### Sidebar

- White surface, border on right, below top bar, vertically scrollable.
- Expanded groups are 44px rows: 20px leading icon, 12px gap, Body Emphasis label, trailing chevron when applicable.
- Exactly one top-level group may be expanded (accordion). Do not make a permanently expanded, long sidebar.
- Sub-items are 40px height, indented another 20px; active item has 3px primary left bar and primary-subtle background.
- Collapsed sidebar is icons only with tooltips.
- Pin a version/build Caption row beneath a divider at the sidebar bottom.

Required groups, ordered exactly:

1. Dashboard
2. Institute Setup — Branches, Academic Structure, Branding & Profile
3. Roles & Permissions — Role Builder, Assignments, Governance Settings
4. People — Staff, Students, Parents
5. Admissions CRM — Enquiries, Funnel Report, Form Builder
6. Attendance — Overview, Leave Approvals
7. Academics — Assessments, Common Tests, Marks & Report Cards
8. Communication — Circulars, Templates
9. Fees — Structure, Collections
10. Timetable
11. Gamification — Points & Categories, Batch Catalog, Leaderboards
12. Network — Partnerships
13. Reports & Analytics
14. Audit Log
15. Compliance & Consent
16. Subscription & Plan

#### Standard Page Header

- Main-content top begins 24px below the top bar.
- Caption breadcrumb: `[Group] / [Page]`, 4px above Display title.
- One Display page title, left aligned.
- Header actions align to title’s right edge. Primary rightmost, Secondary exactly 12px to its left, and optional page overflow 12px left of Secondary.
- On historical academic year selection, show a full-width warning-subtle banner below header: `Viewing [YYYY-YY] — historical data, read-only. Return to current year`. Every mutation action is disabled and explains why on focus/hover.

### Standard screen patterns

**List/table:** Page Header → optional tabs → Filter Bar (24px later) → table card (16px later). Table fills the card edge-to-edge; card itself has no table padding. Preserve Filter Bar when table has no results.

**Detail:** Page Header → tabs directly below header → tab contents. Details are read-first; editing is normally Secondary. Use overflow for destructive actions.

**Settings:** One vertically divided Card; label and description left, control right. Use bottom-right Save in short forms. Use sticky full-width bottom save bar for long, scrollable forms such as Institute Profile.

**Wizard:** only for Role Builder and Common Test creation (and similarly complex, approved multi-stage flows). Center a 720px single-column body, show progress, and use a sticky footer: Back left, step count center, Next/Create right.

## Elevation & Depth

- Cards have white surface, 1px border, 12px radius, 20px internal padding, and **no static shadow**.
- Cards may receive a subtle 8px soft shadow only on hover to signal clickability.
- Drawers/modals use a central `--color-scrim` at 40% opacity. Do not use local black transparency values.
- Drawers overlay rather than push content. Modals are centered and focus-trapping.
- Avoid gradients, glassmorphism, heavy shadows, colored card backgrounds, or ornamental borders.

## Shapes

- Button radius: 8px.
- Card radius: 12px.
- Status badges and filter chips: pill shape.
- Icons: consistent outline icon set; 16px inside standard buttons, 20px sidebar, 24px attention list, 32px top-bar controls, 48px empty state. Decorative icons are hidden from screen readers.
- Avatars: circular; list photo 28px, profile trigger 32px, profile menu header 40px, student overview 80px.

## Components

### Buttons and action hierarchy

**Primary Button**

- Filled primary background, on-primary text, Body Emphasis, 10px vertical/16px horizontal padding, 8px radius.
- Optional leading 16px icon with 8px gap.
- States: default; hover uses primary-hover; pressed uses 2px inset shadow; disabled is 40% opacity with no pointer input; loading replaces label with 16px spinner while locking width.
- Exactly one normal page-level Primary Button. Dashboard intentionally has none. Wizard/composer primary action lives in its sticky footer.

**Secondary Button**

- Surface background, border token, primary text, same metrics as Primary.
- Used immediately left of Primary for a genuine secondary visible action, not as a substitute for overflow.

**Destructive Button**

- Outline danger border/text in ordinary UI. Never place it in a Page Header.
- Use only in a row/card overflow menu or a confirmation modal. The irreversible confirmation modal action may be filled danger.

**Overflow Menu**

- 32×32 icon trigger with vertical dots.
- 200px dropdown; 36px action rows; opens aligned to trigger/right edge and flips left if needed.
- Contains 2–6 actions. Separate destructive section by border and use danger text.
- Keyboard navigation is required.

### Form fields and validation

- Persistent visible label above every control.
- Field stack spacing: 16px. Use smaller spacing only inside a compound field.
- Validate on blur and submit. Render a Caption-sized danger message directly under the failing field.
- Never rely on a generic error banner instead of field errors.
- Use searchable select for people/roles/institutes; conditionally hide—not disable—fields that have no semantic meaning for the selected option (for example, branch selector for institute-wide role).
- Use inline confirmation for directly toggled list status. Use full confirmation modal for destructive state changes.
- Use auto-suggested, editable employee codes only where required; never require users to manually invent operational identifiers.

### Status Badge

- Pill, 4px vertical / 10px horizontal padding, Caption 12px/600.
- Background is central status-subtle token; text is central status token.
- Fixed status semantics in Colors section apply product-wide.

### Data Table

- Header height 44px; canvas background; Micro labels; sortable headers have chevron that becomes ascending/descending state.
- Body row height 56px; Audit Log and intentionally dense tables use 52px.
- Border-bottom uses border token. Hover uses canvas token.
- The first meaningful value is Body Emphasis. Secondary values are Caption.
- Clickable rows navigate except for checkbox and overflow cells.
- Selection checkbox is 20px and exists only when bulk action exists. On selection, replace filter bar with sticky Contextual Action Bar: `N selected`, permitted bulk actions, Clear link.
- Footer is 56px: rows-per-page selector at left (10/25/50/100); First/Prev/Next/Last/page controls at right.
- On mobile render each row as a stacked mini-card with explicit label:value pairs and row actions—never a horizontally scrollable table.

### Cards and KPI Cards

- Standard Card behavior follows Elevation & Depth.
- KPI Card width 200–240px: Micro label, large 28px/700 metric, optional trend bottom-left, optional mini icon right. Use link/card click only when it has a clear destination.
- Dashboard uses five KPI cards in a 16px-gap row, wraps 3+2 at tablet, carousel at mobile.

### Tabs, Filter Bar, Search, empty/error

**Tabs:** horizontal under Page Header, full-width bottom border, active 2px primary underline + Body Emphasis; inactive secondary text.

**Filter Bar:** 48px high; filters/chips left, 240px search input with leading magnifier right. On narrow view, replace chips with a Filters trigger opening a drawer. Keep query/filter state in URL where feasible.

**Empty state:** 48px outline icon in secondary color, H3 title, one Body-secondary explanation, and repeated Primary Button. For filter-empty: no icon; `No results match your filters.` plus Clear filters link.

**Page load error:** inline content banner: warning icon, `Something went wrong loading this page.`, Retry. No full-page visual takeover.

### Drawer, modal, composer, and wizard

**Side Drawer:** 480px fixed width, right-side full-height overlay, 40% token scrim. Header H2 + 32px close; 24px scrollable body; sticky footer separated by border with Cancel then Primary right-aligned, 12px gap. Dirty close must prompt.

**Modal:** 440px confirmation / 560px short form; centered, focus trapped. H3 title, concise body or 1–3 fields; Secondary left, action right. Destructive action is filled danger only here.

**Notification Drawer:** 380px right-side full-height overlay. Header H3 + Mark all as read + close. Group by Today/Yesterday/Earlier; rows show 40px type icon, one-line text, timestamp, unread primary dot. Sticky footer opens full notification list.

**Full-page composer:** for Circulars only. Two columns: flexible 65% rich-text content and sticky 320px targeting/channel panel. Footer contains Save as Draft, Schedule, Send Now.

**Wizard:** progress circles and labels on desktop; mobile textual progress. Sticky footer required. Never use a wizard for a short one-to-three-field form.

### Toast, tooltip, loading, unsaved changes

- Success toast: 360px bottom center, toast-surface background/on-primary text, 4-second auto-dismiss.
- Save failure: danger-styled toast, specific cause when known, 6 seconds.
- Toasts do not carry actionable form errors.
- Tooltips: toast-surface/on-primary, Caption, 6px padding, appear after 400ms hover/focus. Required for disabled least-privilege permission controls.
- Initial page loading: skeleton shapes matching final content; never a standalone centered spinner on data-heavy screens.
- In-place action loading: lock action width, disable duplicate submission, show thin top progress bar if action likely exceeds one second.
- Navigation away from dirty drawer/wizard/form: modal `You have unsaved changes. Leave anyway?` with Stay Secondary and Leave filled danger.

### Permission and historical states

- Permission denied is **visible but disabled**, with a lock icon and tooltip explaining why. Do not hide an otherwise known capability.
- Historical academic year state has warning banner and disables all mutation controls with tooltip `Switch to the current academic year to make changes.`

## Do's and Don'ts

### Do

- Use `var(--color-*)` or approved token objects for every visual color.
- Reuse layout shell and primitives identically across modules.
- Keep tables dense but scannable; expose advanced actions through overflow.
- Use tabs for tightly related modes, drawers for medium forms/details, modals for confirmation/short forms, and wizards only for long multi-stage flows.
- Make safety constraints structurally visible: locks, read-only banners, confirmation copy, disabled states, approval gates.
- Use real labels, descriptive empty states, and progressive disclosure.
- Keep the dashboard calm: no Primary Button, omit zero-count attention rows, show a compact caught-up state when clear.
- Use full-width or responsive stacked layouts as defined; preserve user context (branch + academic year) at all times.

### Don't

- Do not use hex, RGB/RGBA, HSL/HSLA, named colors, arbitrary color classes, or hardcoded SVG colors outside the central theme token definition.
- Do not make red filled destructive buttons visible in normal page content.
- Do not add static shadows to every card, gradients, excessive rounded shapes, or decorative visual noise.
- Do not put more than one Primary Button in a standard page header.
- Do not hide permission-denied controls or silently switch the user to another context.
- Do not use browser-native confirmation dialogs.
- Do not use placeholder-only fields, mouse-only controls, color-only status, or horizontal table scrolling on mobile.
- Do not let a particular module create a one-off table, badge, drawer, filter, or form error pattern.
- Do not silently discard dirty forms or make irreversible changes in one click.

## Screen-level design requirements

This section preserves the essential visual and interaction requirements that agents must apply when implementing Institute Admin modules. Use it with the detailed screen specification; where a screen is named below, the stated pattern is required.

### Dashboard

- No Page Header Primary Button.
- Greeting on canvas: H2 greeting plus Caption date; current Branch/AY context at right and below greeting on mobile.
- Five KPI cards: Active Students, Total Staff, Today’s Attendance, This Month’s Fee Collection, Open Enquiries.
- `Needs your attention` is a full-width Card. Show priority rows only when count exists: leave, two-person award, document verification, low attendance, common-test publish, partnership response. Each row is 56px with urgency icon, text, amber count badge, Review control. Empty = compact success strip.
- Branch comparison exists only in All Branches context. Its rows set global branch context on selection.
- Recent Activity and Upcoming are equal two-column cards, stack on tablet/mobile. Admissions funnel is a full-width compact stage visualization.

### Institute Setup and People

- Branches, Staff, Students, Parents, Assessments, Circulars, Enquiries, Partnerships and similar records use Standard List/Table pattern.
- Add/Edit Branch and Add Student use 480px accordion drawers; identity/profile opens by default. Inline errors are required. Map picker stays 200px tall.
- Branch Detail uses Overview, Staff, Students, Class Sections, Overrides tabs. Overrides must visually separate locked institute-wide settings (neutral/locked panel) from branch-editable settings (surface panel); do not render it as a generic settings form.
- Academic Structure uses tabs. Academic years and short class/subject forms use modal. Class order is a reorderable list with drag handle and autosave toast.
- Institute Profile uses sticky 200px section navigation, long right-side form, sticky bottom Save bar, and a live branding preview. Branding color selection changes the central/saved branding token configuration; it must not create a local literal color style.
- Student profile tabs must include Overview, Academic History, Attendance, Points & Batches, Documents, Guardians. Staff profile uses Overview, Roles & Permissions, Classes & Subjects, Attendance, Documents.
- Parents are linked via student flows; do not show parent creation as a page-level action in Parents list.

### Roles, permissions, governance

- All Roles has scope tabs and a three-step full-page Role Builder: Basics, Permission Matrix, Review.
- Permission Matrix is a left 200px module rail and right permission area. Rows show 20px checkbox, plain-language description, raw key as de-emphasized Caption. Controls user lacks are disabled with locked token, lock icon, and explanation tooltip.
- `points.award_manual` reveals indented maximum-per-award and allowed-category controls only when enabled.
- Review must include plain-English permissions summary and scope recap before saving.
- Role assignments use a visible information banner. Assign Role Drawer conditionally shows Branches only for branch-scoped roles.
- Governance uses the standard settings Card pattern; controls reveal related nested control only when enabled.

### Admissions, attendance, academics

- Enquiries default to Board view: six fixed Kanban stages, draggable cards, optional collapsed columns. List view uses the standard table. Detail opens in drawer with immediate stage/counselor controls, timeline, inline activity logging, and conditional conversion action.
- Funnel report prioritizes funnel visualization then source table. Form Builder has fixed 320px field palette plus live canvas/settings.
- Attendance Overview is monitoring-first: no Page Header Primary Button; KPI row and class-section table. `Not Yet Marked` escalates using danger token after cutoff. Table’s reminder action only enables for unmarked classes.
- Leave Approvals uses Student Leave/Staff Leave tabs, pending badge counts, and confirm modals with optional review note.
- Assessment create is a short drawer; Common Test create is a four-step wizard. Common Test progress must present an unmissable success banner with `Publish Results Now` only once all branches submitted.
- Report-card generation must show batch progress modal and then success toast. Publishing copy must explicitly tell the admin parent visibility is immediate.

### Communication, fees, timetable

- Circular composer is full page with rich editor, attachments, targeting and channel/cost panel; use sticky footer actions rather than normal Page Header action.
- Templates use a short drawer with variable-chip insertion controls.
- Fees Structure uses tabs and drawers. Collections includes three KPIs, filters/table, receipt modal, template-backed reminder, and short manual-payment modal.
- Timetable uses internal tabs. Weekly Grid requires Branch and Class-Section context before grid. Assignment happens through anchored popover, with inline live clash error and disabled Save until resolved or separately acknowledged. Publish Timetable is Primary; Copy from Another Section is Secondary.
- Academic Calendar events use central event-type tokens and legend, never literals.

### Gamification, network, reports, audit, compliance, plan

- Categories are a 4-column card grid; activity types use data table. Platform-default categories have no disabled overflow—they have no overflow at all.
- Batch Catalog uses expandable taxonomy groups and 4-column Batch Card grid. Sensitive batches render a persistent locked Admin-only marker and have structurally non-editable visibility language.
- Leaderboard preview must render the exact privacy result parents see, including anonymization. Privacy Settings follows settings Card convention and makes unavailable network option visible but disabled with explanation.
- Partnerships places incoming pending requests immediately below header in warning-accented Card with inline Accept/Decline, then main table, then read-only network leaderboard preview.
- Reports Gallery uses 3-column 180px report cards. Details show 400px chart then same data table; charts use only chart tokens/legend. Custom Builder is either its full two-column builder or honest no-action Coming Soon empty state.
- Audit Log is intentionally dense, 52px row table, absolute timestamps and inline before/after JSON diff with changed keys using a central warning-subtle token.
- Consent Records are read only. Data deletion is guarded by identity search and typed `DELETE` confirmation. Do not offer casual bulk deletion.
- Subscription shows Current Plan, Usage with tokenized amber/red thresholds, and read-only Billing History. Upgrade opens contact/upsell flow only.

## Accessibility

- Meet WCAG AA contrast minimum: 4.5:1 body text, 3:1 large text. Revalidate if token values change.
- All interactive controls show visible 2px primary focus ring distinct from hover.
- Drawers and modals trap focus, support Escape to close, and return focus to trigger. `/` focuses global search.
- Table overflow menu: Tab to row/action, Enter/Space opens menu, Arrow keys navigate, Escape closes.
- Every control has keyboard operation and accessible name.
- Images of people use their person name as alt text. Decorative icons are `aria-hidden`.
- Use semantic headings in visual hierarchy order; do not choose headings just for size.
- Preserve touch target usability for 32px icon controls and ensure mobile spacing does not make targets smaller.

## Implementation acceptance checklist

Before declaring a screen/component complete, verify:

- [ ] No hardcoded colors exist outside the central token definition; search source for hex, `rgb`, `hsl`, named color values, and arbitrary color utilities.
- [ ] Every color resolves through a semantic variable/token, including SVGs, charts, overlays, state styles, and third-party component configuration.
- [ ] The component reuses the correct primitive and obeys action hierarchy.
- [ ] Desktop/tablet/mobile layout matches breakpoint rules.
- [ ] Loading, true-empty, filtered-empty, load-error, field-error, save-error, success, permission-denied, historical-read-only, destructive-confirmation, and unsaved-change states are covered where applicable.
- [ ] Keyboard navigation, focus management, labels, alt text, tooltip, and contrast requirements pass.
- [ ] Branch and academic-year context remains visible/respected.
- [ ] No new local styling convention, color, shadow, spacing value, or component variant was introduced without updating the central design system.
