# CampusOne Academics Redesign — Feature and UI Plan

## Approved Scope

The redesign keeps **Academic Structure** under Institute Setup and treats the Academics area as the institute's operational learning workspace. The Academics sidebar contains three pages:

1. Academic Overview
2. Teaching & Learning
3. Assessment & Results

The first deliverable is a standalone interactive HTML review prototype. It does not modify the production React screens or APIs.

## Academic Overview

### Features

- Current branch, academic year, term, and week context
- Academic setup health and a direct link to Academic Structure
- Priority alert strip for work requiring immediate attention
- Teaching-plan coverage, homework completion, upcoming assessments, and result-publication metrics
- End-to-end academic workflow health: plan instruction, deliver learning, run assessments, and publish results
- Today's academic agenda and next-seven-day milestones
- Class readiness comparison
- Recent academic activity feed

### UI Setup

- Compact page header with secondary and primary actions
- Persistent context strip immediately below the header
- Four action-oriented metrics rather than vanity statistics
- Two-column operational dashboard for workflow health and upcoming work
- Lower detail cards for class readiness and recent activity

## Teaching & Learning

### Features

- Lesson Plans and Homework tabs
- Weekly plan coverage, approval queue, teacher coverage, and submission metrics
- Search plus class and status filters
- Draft, submitted, approved, active, due-today, and overdue states
- Lesson-plan details drawer with schedule, intent, objectives, and resources
- Review, edit, track, remind, export, and quick-create actions
- Realistic assignment and teacher records for layout review

### UI Setup

- Tabs sit directly under the shared academic context
- Summary metrics remain consistent with the overview cards
- Search and filters live in the record-card toolbar
- Dense but readable rows expose the most important status and action without opening a record
- The slide-over drawer preserves the user's list context

## Assessment & Results

### Features

- Exams, Marks Entry, and Report Cards tabs
- Exam schedule, question-paper readiness, room allocation, and invigilator progress
- Marks-entry completion, class average, verification queue, and students needing support
- Report-card generation and publication batches
- Ready, preparing, planning, verified, in-progress, and published states
- Export, create, continue-entry, review, generate, and publish actions

### UI Setup

- Exam view pairs the schedule with a focused readiness panel
- Marks use a data table with inline completion bars and student-support indicators
- Report cards use class-level batch cards for generation and publication progress
- Status colors remain semantic and consistent across all three pages

## Shared Experience

- Existing CampusOne top bar, sidebar structure, typography, spacing, and token colors
- Inter typography with the project's system-font fallback
- White operational surfaces on the existing `#f5f7fa` canvas
- CampusOne blue for primary actions, green for healthy states, amber for attention, red for overdue work, and violet for review or publication workflows
- 8–12px control and card radii to match the current admin interface
- Visible keyboard focus, semantic controls, labelled inputs, Escape-to-close drawers and dialogs, and reduced-motion support
- Responsive off-canvas navigation and single-column mobile layouts without horizontal overflow

## Prototype Interactions

- Switch among all three academic pages without reloading
- Switch inner workflow tabs
- Search lesson plans
- Open and close the lesson-plan details drawer
- Open the quick-create dialog and receive a local success confirmation
- Open and close the responsive mobile navigation

## Review Artifact

- `academic-redesign-review.html` — standalone HTML, CSS, and JavaScript prototype
- `academic-redesign-review.test.mjs` — interaction and shell-compatibility checks
- `design-qa.md` — visual and interaction verification record

