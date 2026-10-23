# Original Marksheet Studio v5 in CampusOne

## Entry point

Academics → Assessment & Results → Studio v5. Available to institute and branch administrators alongside the existing marks entry, approval, analytics, and issued marksheet screens.

The original supplied HTML is preserved at `apps/institute-admin-web/src/features/academics/results/studio/reference.html`. Its SHA-256 is `d2229185d026dc1c24703c44e9d88a50b294cdac83a01308ef037f3f5f5140d0`, identical to the supplied v5 file. The build embeds local dependencies, compiled Tailwind styles, and fonts, then adds the CampusOne integration. The original layout markup and workflow remain the source of truth.

## Features retained from the supplied file

| Area | Available controls |
| --- | --- |
| Input | Excel workbook/sheet selection, CSV, pasted tables, editable grid, add/delete rows and columns, sample XLSX, four demonstration datasets |
| Mapping | Student name, roll, class, parents, DOB, attendance, remarks, photo URL, phone, email, imported total; subject inclusion, labels, codes, maximum/pass marks, credits; theory/practical columns and default maxima |
| Data review | AB/ML/EX codes, anomaly scan, automatic fixes, subject moderation, student sorting and row reordering |
| Academic engine | All/best-N/fixed/imported aggregates, standard and custom percentage formulas, rounding, grade bands, relative grading, GPA/credit SGPA/US GPA, term weights, grace, attendance/pass/compartment/division rules, rank method/basis/eligibility/display, automatic remarks |
| Exact layouts | Classic Board, Modern Executive, University Transcript, Royal Heritage; report card, merit certificate, combined mode |
| Appearance | Six color palettes, typography, borders, A4/A3/A5/B5/US Letter/Legal, portrait/landscape, PDF margins, English/Hindi/bilingual, institution branding, logos/crests, current student photo, uploaded signatures, stamp text, QR-code size/content |
| Composition | Column and section visibility, subject visibility, section and subject reordering, totals in words, GPA, rank, division, mini chart, legend, QR, watermark and signature options |
| Preview | Live current-student preview, previous/next student, name/roll search, status/top-three filters, batch view and print |
| Exports | Single PDF, one PDF per student in ZIP, PNG/JPEG cards, Word-compatible `.doc`, HTML, result XLSX/CSV, board gazette PDF/PNG/JPEG/Word/HTML, JSON configuration presets |
| Class views | Gazette/register, name/roll/result sorting, subject performance and grade distribution analytics |
| Sharing | Original WhatsApp and email composition actions. The user reviews and sends through their own application; this does not add an automatic messaging service. |

## Platform workflow

1. Select academic year, class, section and exam in the existing context bar.
2. Open Studio v5. The initial dataset is explicitly labelled as a demonstration.
3. Choose **Load selected exam** to copy enrolled students, saved marks, subject maxima/pass marks, grades and supported exam rules into the studio. School branding is supplied automatically. Alternatively, import a workbook directly using the original controls.
4. Review mappings, missing marks, academic rules and appearance before exporting. Source exams with more than two components per subject load a combined total and display a warning. Missing marks remain blank in the grid; the original engine's calculation rules apply, so complete them before sharing.
5. Name and save the workspace. Save as new creates another working copy; the selector restores the complete dataset, mappings, formulas, appearance and uploaded images.
6. For approval, publication, immutable issued documents and combined reports across multiple exams, use the existing Review Results and Marksheets workflows. Studio exports are editable working copies and do not overwrite approved marks or issued files.

School imports do not invent attendance or affiliation text. Missing attendance displays N/A. The reference's demonstration co-scholastic grades are hidden for school exam imports. Users can configure these original sections explicitly.

## Persistence and API

Studio workspaces reuse `ResultReport.config` with `kind: MARKSHEET_STUDIO_V5`; no additional database migration is required. The normal report listing excludes these workspaces. Config stores source exam, section, student count and the complete whitelisted studio state. Existing institute/branch authorization applies to every endpoint. Saves require the latest `updatedAt` revision to prevent stale overwrites.

| Method | Results API path | Purpose |
| --- | --- | --- |
| GET | `studio/branding` | Current institution branding |
| GET | `studio/exams/{id}/source` | Read-only exam working copy |
| GET/POST | `studio/workspaces` | List or create/update a saved workspace |
| GET | `studio/workspaces/{id}` | Restore full saved state |

Cloud saves allow 2 MB of JSON, up to 10,000 rows, 700 headers and 200,000 cells. Reduce large uploaded images before saving. Workbook parsing, previews and exports remain local to the browser; JSON presets remain downloadable. The workspace list returns the latest 100 copies for the current section.

## Isolation and export integration

The studio iframe has an opaque origin and receives no authentication token or access to parent storage. A channel-bound message bridge accepts only its own frame. CSP disables network API calls; styles, libraries and fonts are bundled locally. User-selected remote image URLs can still load images.

The original html2canvas library cannot clone documents inside an opaque-origin iframe. Its render entry point therefore sends markup/styles to a temporary script-disabled export iframe owned by the parent. This iframe permits same-origin DOM access for rendering while scripts, forms, popups and top navigation remain disabled. The resulting PNG is returned to the original PDF/image/ZIP/Word functions. Export documents are removed after rendering; rendering requests have size/dimension limits. Very long gazettes should be split into smaller exports.

Other integration fixes: bounded arithmetic replaces dynamic JavaScript formula evaluation, zero practical maxima stay zero, US GPA values already on a 0–4 scale are not normalized twice, CSV text is protected against formula injection, and loaded JSON presets synchronize the original controls. Loading a different dataset resets prior student photos and configuration before applying the new copy.

Word output retains the supplied implementation: formatted HTML with a `.doc` extension and an optional rendered snapshot. It is not native `.docx`; Word and print engines can paginate differently.

## Build and checks

`npm run dev --workspace apps/institute-admin-web` and the normal admin build generate `public/marksheet-studio/v5.html` plus third-party notices. Generated files are ignored by git. The supplied HTML remains checked in. Unchanged generated assets are not rewritten.

Automated coverage includes formula parsing, original feature/layout inventory, iframe channel/origin isolation, render request validation, exam source conversion, save/load/revision protection, malformed-state rejection, institute isolation and teacher permissions. Browser checks cover school data loading, persisted workspace restore, exact preview and PNG download. Actual outbound messages and production deployment are outside this change.
