# Feature Specification: Secure File Storage

**Feature Branch**: `feature/template-studio`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "Store school photos, PDFs, marksheets, notes, and other files outside the application database while retaining searchable metadata, enforcing tenant-aware access, supporting efficient uploads and downloads, auditing sensitive access, and providing recoverable deletion and optimized previews."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload and Register School Files (Priority: P1)

An authorized staff member uploads a supported photo or document for a student, staff member, class, subject, term, or institute and sees it attached to the correct record without the application becoming unresponsive.

**Why this priority**: Reliable file capture is the minimum usable capability. Access, previews, and retention depend on a correctly registered file.

**Independent Test**: An authorized staff member can upload one valid student document, confirm its name, type, owner, size, uploader, and upload time, and retrieve the same unmodified content from the student record.

**Acceptance Scenarios**:

1. **Given** an authorized staff member is viewing a record in their institute, **When** they select a valid supported file and complete the upload, **Then** the file is attached to that record and its metadata is available without storing the file contents in the application database.
2. **Given** an upload is incomplete, expired, or interrupted, **When** the completion is reported, **Then** the system does not expose the file as available and gives the user a safe retry action.
3. **Given** a file has a disallowed type, misleading extension, unsafe content signature, or excessive size, **When** upload is attempted, **Then** the upload is rejected with a specific, user-correctable message and no active file record is created.
4. **Given** a user from another institute or without upload permission, **When** they attempt to attach a file, **Then** access is denied without revealing the target record or storage location.

---

### User Story 2 - View and Download Authorized Files (Priority: P2)

Students, parents, and staff can quickly view or download files they are permitted to access, while sensitive records remain unavailable to everyone else.

**Why this priority**: School files provide value only when the intended audience can retrieve them safely and consistently.

**Independent Test**: A student, linked parent, and authorized staff member can each access an assigned private marksheet, while an unrelated user and a user from another institute are denied; a designated public asset can be viewed without exposing any private asset.

**Acceptance Scenarios**:

1. **Given** a user is entitled to a private file, **When** they request to view or download it, **Then** access is granted for a limited period and the file contents are delivered over a secure connection.
2. **Given** a user lacks permission, belongs to another institute, or uses an expired access grant, **When** they request a private file, **Then** access is denied with a safe response and no private metadata or storage location is disclosed.
3. **Given** an asset is explicitly designated as public, **When** it is requested, **Then** it can be displayed efficiently without making related private assets public.
4. **Given** a private file is accessed, previewed, downloaded, or denied, **When** the request finishes, **Then** the security-relevant outcome is recorded in an audit history.

---

### User Story 3 - Manage File Lifecycle and Recovery (Priority: P3)

An authorized administrator can replace or remove an outdated file, recover it during a retention window, and understand who changed or accessed it.

**Why this priority**: Schools need safe correction and dispute handling without permanent accidental loss or an unauditable record history.

**Independent Test**: An administrator can soft-delete a document, confirm it is unavailable to normal users, restore it within the retention window, and verify that deletion and restoration are present in its audit history.

**Acceptance Scenarios**:

1. **Given** an active file, **When** an authorized administrator removes it, **Then** it becomes unavailable to ordinary users but remains recoverable during the configured retention window.
2. **Given** a recoverable file, **When** an authorized administrator restores it before retention expires, **Then** its previous ownership, privacy, and metadata are restored and the action is audited.
3. **Given** a file has exceeded its retention window, **When** scheduled disposal succeeds, **Then** both the stored content and active metadata are removed according to policy while a minimal non-sensitive disposal audit remains.
4. **Given** removal of stored content fails, **When** cleanup runs, **Then** the system retains a reconcilable record, reports the failure for operators, and does not claim successful disposal.

---

### User Story 4 - Use Efficient Image and Document Previews (Priority: P4)

Users browsing student, staff, and document lists see lightweight previews instead of downloading full-size source files.

**Why this priority**: Previews improve page speed and reduce unnecessary data transfer but are not required for the core upload and retrieval lifecycle.

**Independent Test**: Uploading a valid profile image produces a list-view preview associated with the source; users can view the preview without fetching the original, and a preview failure does not make the original file unavailable.

**Acceptance Scenarios**:

1. **Given** a valid profile image has completed upload, **When** processing succeeds, **Then** a compact preview is associated with the original and used in list views.
2. **Given** preview processing fails, **When** the user returns to the record, **Then** the original remains available, the UI shows an appropriate fallback, and operators can diagnose or retry processing.
3. **Given** a PDF category supports visual previews, **When** processing succeeds, **Then** its preview inherits the source file's access restrictions.

### Edge Cases

- A completion request is received twice for the same upload.
- A completion request references content that is missing, has changed, or does not match the declared size or type.
- Two users replace the same profile photo at nearly the same time.
- A student's parent relationship or staff role changes while an access grant is still valid.
- A user attempts to move or associate a file with a record in another institute.
- A source file is deleted while preview generation or malware scanning is in progress.
- A public asset is reclassified as private while a previously cached copy exists.
- Storage is temporarily unavailable, slow, rate-limited, or returns an ambiguous result.
- A file name contains duplicate names, Unicode characters, path separators, or control characters.
- An administrator attempts to restore a file after its retention window has ended.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store file contents separately from relational business records and MUST retain only metadata, relationships, processing state, and audit information in those records.
- **FR-002**: The system MUST support files owned by an institute and associated with students, staff, classes, subjects, terms, or the institute itself without allowing cross-institute association.
- **FR-003**: The system MUST support, at minimum, profile photos, institute branding images, student and staff documents, marksheets, academic notes, and other explicitly approved document categories.
- **FR-004**: The system MUST record a stable file identifier, original display name, media type, byte size, category, owning institute, associated owner, privacy classification, uploader, upload time, integrity evidence, lifecycle state, and storage locator for every completed file.
- **FR-005**: The system MUST allow only authenticated, authorized users to initiate uploads and MUST evaluate institute, branch, role, category, and owner scope before granting permission.
- **FR-006**: The system MUST allow an authorized client to transfer file content without routing the file bytes through the main application process.
- **FR-007**: Upload authorization MUST be single-purpose, short-lived, limited to the intended file location and operation, and unusable after completion or expiry.
- **FR-008**: The system MUST not mark a file active until it verifies that the expected content exists and matches the declared size, permitted media signature, and upload authorization.
- **FR-009**: Repeated initiation and completion requests for the same logical upload MUST not create duplicate active file records or overwrite unrelated content.
- **FR-010**: The system MUST enforce configurable file-size limits, allowed media types, safe file-name handling, and category-specific validation before a file becomes active.
- **FR-011**: The system MUST default every file to private unless its category and an authorized action explicitly permit public visibility.
- **FR-012**: Private files MUST only be accessible after current server-side authorization confirms the requester's tenant, role, and relationship to the associated record; access MUST expire after a short, bounded period.
- **FR-013**: Students MAY access their own released records; linked parents or guardians MAY access released records for their linked students; and authorized staff MAY access records allowed by their institute and role scope.
- **FR-014**: Public visibility MUST be limited to explicitly designated non-sensitive assets, and changing an asset from public to private MUST prevent new public retrieval and trigger invalidation of cached public copies.
- **FR-015**: File contents and access credentials MUST be protected in transit and at rest, and secrets, private storage locators, and personal data MUST not appear in user-visible errors or unsafe logs.
- **FR-016**: The system MUST record security-relevant upload, completion, preview, download, access-denial, replacement, deletion, restoration, and disposal events with actor, time, institute, file, action, and outcome where applicable.
- **FR-017**: Authorized administrators MUST be able to soft-delete files, making them unavailable to ordinary users while preserving recovery for a configurable retention period.
- **FR-018**: Authorized administrators MUST be able to restore a soft-deleted file before retention expires; after expiration, disposal MUST remove file contents and active metadata or retain a visible reconciliation state if either removal step fails.
- **FR-019**: Replacing a singleton asset such as a profile photo or institute logo MUST activate the new file without destroying the prior file before the replacement is verified, and MUST place the prior file into its retention lifecycle.
- **FR-020**: The system MUST support derived previews for profile images and optionally for PDFs, keep each preview linked to its source, and apply privacy no weaker than the source file.
- **FR-021**: Failure to generate a preview MUST not make the original file unavailable and MUST produce an observable, retryable processing state.
- **FR-022**: User-facing upload and access failures MUST return a stable error category, safe plain-language explanation, and a corrective or retry action where recovery is possible.
- **FR-023**: External storage operations MUST have bounded duration, controlled retries, and reconciliation for ambiguous outcomes; retrying MUST not duplicate or overwrite a different file.
- **FR-024**: Operators MUST be able to identify incomplete uploads, missing content, orphaned content, failed processing, failed disposal, and metadata/content mismatches without reading private file contents.
- **FR-025**: Lists of files and access history MUST be bounded, filterable by relevant ownership and category fields, and ordered consistently.

### Scope Boundaries

**In scope**:

- Upload, completion, metadata registration, authorized retrieval, public/private classification, preview variants, audit history, soft deletion, restoration, final disposal, and reconciliation.
- Photos, branding images, PDFs, marksheets, student/staff documents, academic notes, and approved future categories.
- Tenant and role enforcement for institute-owned files.

**Out of scope**:

- Authoring or editing the contents of PDFs and office documents.
- General-purpose personal cloud drives, folder collaboration, or public file sharing by end users.
- Long-term archival policy beyond the configurable soft-delete retention window.
- Bulk migration of legacy file contents; migration may be specified separately after existing data is inventoried.
- Provider selection, pricing commitments, and vendor-specific operational configuration.

### Key Entities

- **File Asset**: A school-owned file record containing identity, display metadata, category, ownership, privacy, integrity evidence, lifecycle state, storage locator, and timestamps, but not the file contents.
- **Upload Authorization**: A short-lived, single-purpose record that binds an uploader, institute, intended owner, category, expected file properties, expiry, and completion status.
- **File Variant**: A derived preview or thumbnail linked to one source asset, with its own dimensions, size, processing state, and privacy constrained by the source.
- **File Access Event**: An immutable security event describing an attempted or completed file action, its actor, institute, time, outcome, and safe request context.
- **Retention Record**: The deletion, recovery deadline, restoration, disposal, and reconciliation state associated with a file lifecycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of authorized users can begin a valid upload within 2 seconds and complete a 10 MB upload without the CampusOne application becoming unresponsive under normal school connectivity.
- **SC-002**: At least 95% of authorized requests for files up to 10 MB begin displaying or downloading within 3 seconds under normal school connectivity.
- **SC-003**: In authorization tests, 100% of cross-institute, unrelated-parent, insufficient-role, expired-grant, and soft-deleted-file access attempts are denied without exposing a private storage location.
- **SC-004**: In integrity tests, 100% of incomplete, altered, oversized, disallowed, or mismatched uploads remain unavailable as active files and give the user a clear next action.
- **SC-005**: Every completed sensitive-file view, preview, download, deletion, restoration, and final disposal is traceable to an actor or system process, institute, file, timestamp, action, and outcome.
- **SC-006**: For valid profile photos, a compact list-view preview is available within 60 seconds for at least 99% of uploads; preview failure never blocks access to the original.
- **SC-007**: An authorized administrator can delete and restore an eligible file in no more than 2 minutes without assistance or knowledge of internal identifiers.
- **SC-008**: The feature supports at least 50 GB of files and the routine activity of a 2,000-student, 200-staff institute without measurable degradation of unrelated CampusOne workflows.
- **SC-009**: Database inspection confirms that zero uploaded file bodies are stored in relational business records.
- **SC-010**: At least 90% of representative staff, student, and parent test participants complete their primary upload or retrieval task on the first attempt.

## Assumptions

- CampusOne's existing identity, institute membership, branch scope, student-guardian links, and role permissions remain the authority for access decisions.
- Files are private by default. Public delivery is reserved for non-sensitive assets explicitly permitted by product policy; personal documents and academic records are always private.
- A 15-minute soft-delete recovery period is sufficient for automated test environments; production retention is configurable and defaults to 30 days until a formal records policy supersedes it.
- Upload and retrieval require network connectivity; offline synchronization is not included.
- Existing file records and stored content, if any, will be inventoried before migration. This feature must preserve compatibility during a separately planned migration.
- Security scanning may be added as part of implementation where a supported scanning capability is available; regardless, type, signature, size, authorization, and integrity validation are mandatory.
- The application will rely on a production-supported external storage service capable of secure, tenant-organized file storage and time-limited access, but the vendor is selected during planning.
- Operational retention of non-sensitive audit history follows CampusOne's standard audit policy and applicable school requirements.
