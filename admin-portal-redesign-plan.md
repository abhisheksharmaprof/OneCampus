# Institute Admin Portal Redesign Plan

## Objective

Rebuild the CampusOne institute admin experience to match the supplied `institute-admin-panel-v6.html` reference at a component and layout level, while keeping all displayed information and actions backed by the existing API/database.

## Scope

1. Audit the reference's tokens, shell, navigation, responsive behavior, pages, modal behavior, and action patterns.
2. Consolidate the React shell and reusable UI primitives to the reference design system.
3. Apply the design consistently to dashboard, institute setup, people, academics, finance, attendance, admissions, timetable, and operational screens.
4. Preserve deep-link detail pages for students/staff and use accessible modal dialogs for short workflows; do not reproduce the reference's right-side drawer.
5. Ensure API-backed data, empty/loading/error states, and mutation feedback are correct.
6. Correct institute associations so every location is an independent institute; an association denotes a peer operating relationship, never a parent/child tenancy hierarchy.
7. Seed a credible test institute only where database data is absent, then run frontend and backend validation.

## Implementation Sequence

1. Finish codebase and reference audits; record the required screen inventory and data gaps.
2. Implement API/model changes for peer institute associations and reliable test seed data, with backend tests.
3. Implement reference-faithful shell, global tokens, page-header/table/form/modal primitives, and migrate core pages.
4. Migrate remaining operational layouts and replace inappropriate drawers with routes or modals.
5. Validate builds, unit/API tests, navigation, mutation flows, responsive shell, and visual regression screenshots.

## Quality Gates

- Typecheck, lint, and production build pass for the admin app.
- Relevant Django API tests pass, including seed and institute-association tests.
- No mock-only production view where a supporting endpoint exists.
- All buttons provide a working action, disabled rationale, or visible unavailable-state explanation.
- No UI copy or model terminology implies that an associated institute is a sub-institute.
