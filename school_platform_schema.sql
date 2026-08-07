-- ============================================================================
-- SCHOOL MANAGEMENT & CRM PLATFORM — PHASE 1 DATABASE SCHEMA
-- PostgreSQL 14+
--
-- REFERENCE SNAPSHOT ONLY — DJANGO MIGRATIONS ARE THE DEPLOYABLE AUTHORITY.
-- Snapshot revision: 2026-07-18 (identity 0003, access_control 0002,
-- academics 0001, admin_console 0001). Do not deploy this file in place of
-- `manage.py migrate`.
-- ============================================================================
-- Design principles:
--  1. UUID primary keys everywhere (gen_random_uuid()) — never leak sequence
--     info, never collide across tenants.
--  2. Every human-facing entity ALSO gets a short, unique, readable code
--     (institute_code, branch_code, admission_number, employee_code) for use
--     on ID cards, report cards, and support calls.
--  3. Multi-tenancy: institute_id / branch_id sits on every tenant-scoped
--     table and is enforced twice — application layer AND PostgreSQL
--     Row-Level Security (Section 13). Neither layer is trusted alone.
--  4. Soft deletes for anything with legal/historical retention needs.
--  5. institute -> branch -> everything else. A single-campus school is
--     just an institute with exactly one branch.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SECTION 1: PLATFORM LEVEL
-- ============================================================================

CREATE TABLE subscription_plans (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code               VARCHAR(30) UNIQUE NOT NULL,
    name                    VARCHAR(100) NOT NULL,
    description             TEXT,
    max_branches            INTEGER,
    max_students            INTEGER,
    price_per_student_year  NUMERIC(10,2),
    flat_annual_fee         NUMERIC(10,2),
    features_json           JSONB NOT NULL DEFAULT '{}',
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_admins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    phone           VARCHAR(20) UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

-- ============================================================================
-- SECTION 2: INSTITUTES & BRANCHES (multi-branch tenancy)
-- ============================================================================
-- INSTITUTE = the legal/organizational tenant (e.g. a trust running several
--             schools under one brand).
-- BRANCH    = one physical campus/location under that institute. Every
--             operational record (students, staff, classes) belongs to a
--             branch, and each branch has its own admin(s) and staff.

CREATE SEQUENCE institute_code_seq START 1;

CREATE TABLE institutes (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_code                  VARCHAR(20) UNIQUE NOT NULL
                                        DEFAULT ('INST' || LPAD(nextval('institute_code_seq')::TEXT, 6, '0')),

    -- identity
    legal_name                      VARCHAR(255) NOT NULL,
    display_name                    VARCHAR(255) NOT NULL,
    institute_type                  VARCHAR(30) NOT NULL DEFAULT 'school'
        CHECK (institute_type IN ('school','college','coaching_center','university','other')),
    board_affiliation                VARCHAR(50)
        CHECK (board_affiliation IN ('CBSE','ICSE','State Board','IB','IGCSE','NIOS','Other')),
    board_affiliation_number         VARCHAR(50),
    udise_code                       VARCHAR(20),
    establishment_year               INTEGER,
    medium_of_instruction             VARCHAR(50) DEFAULT 'English',

    -- legal / compliance (India-first, extendable to other markets)
    registered_entity_type            VARCHAR(30)
        CHECK (registered_entity_type IN ('trust','society','private_limited','partnership','government','other')),
    registration_number               VARCHAR(50),
    pan_number                        VARCHAR(20),
    gst_number                        VARCHAR(20),

    -- head-office contact (branch-level addresses live on `branches`)
    head_office_address_line1         VARCHAR(255),
    head_office_address_line2         VARCHAR(255),
    head_office_city                  VARCHAR(100),
    head_office_state                 VARCHAR(100),
    head_office_country                VARCHAR(100) DEFAULT 'India',
    head_office_postal_code            VARCHAR(20),
    primary_email                      VARCHAR(150) NOT NULL,
    primary_phone                      VARCHAR(20) NOT NULL,
    alternate_phone                    VARCHAR(20),
    website_url                        VARCHAR(255),

    -- primary point of contact for the account
    primary_contact_name               VARCHAR(150) NOT NULL,
    primary_contact_designation        VARCHAR(100),
    primary_contact_phone              VARCHAR(20) NOT NULL,
    primary_contact_email              VARCHAR(150),

    -- branding
    logo_url                           VARCHAR(500),
    letterhead_url                     VARCHAR(500),
    brand_primary_color                VARCHAR(20),

    -- scale info captured at signup (informs plan recommendation; not enforced)
    approx_total_students               INTEGER,
    approx_total_staff                  INTEGER,
    number_of_branches_at_signup        INTEGER DEFAULT 1,

    -- academic defaults
    default_grading_scale               VARCHAR(20) NOT NULL DEFAULT 'percentage'
        CHECK (default_grading_scale IN ('percentage','gpa','letter_grade','custom')),
    academic_year_start_month           INTEGER NOT NULL DEFAULT 4
        CHECK (academic_year_start_month BETWEEN 1 AND 12),

    -- leaderboard / network participation (see Section 11)
    leaderboard_visible_to_parents      BOOLEAN NOT NULL DEFAULT FALSE,
    participate_in_global_leaderboard   BOOLEAN NOT NULL DEFAULT FALSE,
    global_leaderboard_opted_in_at      TIMESTAMPTZ,

    -- platform lifecycle
    onboarding_status                   VARCHAR(20) NOT NULL DEFAULT 'pending_review'
        CHECK (onboarding_status IN ('pending_review','approved','rejected','suspended')),
    reviewed_by                          UUID REFERENCES platform_admins(id),
    reviewed_at                          TIMESTAMPTZ,
    rejection_reason                     TEXT,
    is_active                            BOOLEAN NOT NULL DEFAULT TRUE,

    created_at                           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE institute_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id    UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    document_type   VARCHAR(50) NOT NULL
        CHECK (document_type IN ('affiliation_certificate','registration_certificate','pan_card','gst_certificate','other')),
    file_url        VARCHAR(500) NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by     UUID REFERENCES platform_admins(id),
    verified_at     TIMESTAMPTZ
);

CREATE TABLE institute_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id            UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'trial'
        CHECK (status IN ('trial','active','past_due','cancelled')),
    trial_ends_at           TIMESTAMPTZ,
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE branch_code_seq START 1;

CREATE TABLE branches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id        UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_code         VARCHAR(20) UNIQUE NOT NULL
                            DEFAULT ('BR' || LPAD(nextval('branch_code_seq')::TEXT, 6, '0')),
    name                VARCHAR(150) NOT NULL,
    is_head_office      BOOLEAN NOT NULL DEFAULT FALSE,

    address_line1       VARCHAR(255) NOT NULL,
    address_line2       VARCHAR(255),
    city                VARCHAR(100) NOT NULL,
    state               VARCHAR(100) NOT NULL,
    country             VARCHAR(100) NOT NULL DEFAULT 'India',
    postal_code         VARCHAR(20),
    latitude            NUMERIC(9,6),
    longitude           NUMERIC(9,6),

    branch_phone        VARCHAR(20),
    branch_email        VARCHAR(150),
    branch_admin_name   VARCHAR(150),

    timezone            VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (institute_id, name)
);

CREATE TABLE rooms (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    room_number         VARCHAR(50) NOT NULL,
    room_type           VARCHAR(50) NOT NULL DEFAULT 'classroom'
        CHECK (room_type IN ('classroom','lab','library','hall','office','other')),
    capacity            INTEGER CHECK (capacity > 0),
    floor               VARCHAR(50),
    building            VARCHAR(100),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (branch_id, room_number)
);

-- ============================================================================
-- SECTION 3: USERS, ROLES & PERMISSIONS (custom RBAC)
-- ============================================================================
-- `users` is ONE identity table for every human who logs in — staff AND
-- parents — since both authenticate the same way (phone + OTP) and the
-- permission system decides what they can do, not a hardcoded table split.
--
-- `permissions` is a fixed, platform-defined list of granular actions.
-- `roles` can be a system default (institute_id IS NULL) or a fully custom
-- role an institute admin creates (institute_id set, optionally branch_id
-- set for a branch-only role like "Sports Coordinator — Jaipur"). Either
-- way a role is just a named bundle of permissions via `role_permissions`.
-- `user_role_assignments` grants a specific user a specific role, scoped to
-- one institute and (optionally) one branch.

CREATE TABLE access_control_permission (
    id              UUID PRIMARY KEY,
    permission_key  VARCHAR(100) UNIQUE NOT NULL,      -- e.g. 'attendance.mark'
    module          VARCHAR(50) NOT NULL,               -- e.g. 'attendance'
    description     VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID REFERENCES branches(id) ON DELETE CASCADE,
    phone               VARCHAR(20) UNIQUE NOT NULL,
    email               VARCHAR(150) UNIQUE,
    password_hash       VARCHAR(255),                    -- nullable: OTP-only accounts may never set one
    full_name           VARCHAR(150) NOT NULL,
    photo_url           VARCHAR(500),
    employee_code       VARCHAR(20) UNIQUE,               -- NULL for parents; set for staff
    user_type           VARCHAR(20) NOT NULL
        CHECK (user_type IN ('institute_admin','staff','parent')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    otp_required        BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified_at   TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Django identity.0003. The deployed FK targets identity_user; this reference
-- snapshot retains the legacy semantic users table until identity is migrated.
CREATE TABLE identity_otpchallenge (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash           VARCHAR(64) NOT NULL,
    client              VARCHAR(20) NOT NULL,
    institute_id        UUID,
    expires_at          TIMESTAMPTZ NOT NULL,
    attempts            SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts        SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts >= 0),
    consumed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX identity_ot_user_id_786868_idx
    ON identity_otpchallenge (user_id, created_at);

CREATE TABLE access_control_role (
    id              UUID PRIMARY KEY,
    institute_id    UUID REFERENCES institutes(id) ON DELETE CASCADE,   -- NULL = system default, available to every institute
    branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,      -- NULL = institute-wide role; set = usable only at this branch
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(255) NOT NULL,
    is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE for the four built-ins below
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ac_role_valid_ownership CHECK (
        (branch_id IS NULL AND institute_id IS NULL AND is_system_role)
        OR (institute_id IS NOT NULL AND NOT is_system_role)
    )
);

CREATE TABLE access_control_rolepermission (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    role_id         UUID NOT NULL REFERENCES access_control_role(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES access_control_permission(id) ON DELETE CASCADE,
    configuration   JSONB NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL,

    CONSTRAINT ac_unique_role_permission UNIQUE (role_id, permission_id)
);

CREATE TABLE access_control_userroleassignment (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES access_control_role(id),
    institute_id    UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,       -- NULL = applies institute-wide (e.g. institute admin)
    assigned_by_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from      TIMESTAMPTZ,
    valid_until     TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at      TIMESTAMPTZ,
    revoked_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ac_assignment_valid_window CHECK (
        valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from
    ),
    CONSTRAINT ac_active_assignment_not_revoked CHECK (
        (is_active AND revoked_at IS NULL) OR NOT is_active
    )
);

-- Django's conditional UniqueConstraints intentionally replace a nullable
-- four-column UNIQUE, which would permit duplicate institute-wide grants.
CREATE UNIQUE INDEX ac_unique_system_role_name
    ON access_control_role(name) WHERE is_system_role;
CREATE UNIQUE INDEX ac_unique_institute_role_name
    ON access_control_role(institute_id, name)
    WHERE branch_id IS NULL AND NOT is_system_role;
CREATE UNIQUE INDEX ac_unique_branch_role_name
    ON access_control_role(institute_id, branch_id, name)
    WHERE branch_id IS NOT NULL AND NOT is_system_role;
CREATE UNIQUE INDEX ac_unique_active_institute_assignment
    ON access_control_userroleassignment(user_id, role_id, institute_id)
    WHERE branch_id IS NULL AND is_active;
CREATE UNIQUE INDEX ac_unique_active_branch_assignment
    ON access_control_userroleassignment(user_id, role_id, institute_id, branch_id)
    WHERE branch_id IS NOT NULL AND is_active;

-- Generic admin-console records backing the screen catalog in migration 0001.
CREATE TABLE admin_records (
    id              UUID PRIMARY KEY,
    institute_id    UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
    created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    screen_id       VARCHAR(4) NOT NULL,
    record_type     VARCHAR(64) NOT NULL,
    title           VARCHAR(240) NOT NULL,
    status          VARCHAR(64) NOT NULL,
    data            JSONB NOT NULL,
    version         BIGINT NOT NULL CHECK (version >= 0),
    is_active       BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_admrec_valid_screen CHECK (screen_id IN (
        'H1','BR1','BR2','ST1','ST2','ST3','RP1','RP2','SD1','SD2','SD3',
        'AD1','AD2','AD3','AD4','AD5','AD6','AC1','AC2','AC3','AC4','AC5',
        'AC6','AC7','AT1','AT2','AT3','FN1','FN2','FN3','FN4','CM1','CM2',
        'TT1','TT2','RG1','RG2','RG3','RG4','RG5','RA1','RA2','AO1','AO2',
        'AO3','SE1','SE2','SE3','SE4','SE5','AL1','NT1','PR1','HP1'
    )),
    CONSTRAINT ck_admrec_version_gte_1 CHECK (version >= 1),
    CONSTRAINT ck_admrec_type_not_empty CHECK (record_type <> ''),
    CONSTRAINT ck_admrec_title_not_empty CHECK (title <> ''),
    CONSTRAINT ck_admrec_status_not_empty CHECK (status <> '')
);

-- ============================================================================
-- SECTION 4: ACADEMIC STRUCTURE
-- ============================================================================

CREATE TABLE academic_years (
    id              UUID PRIMARY KEY,
    institute_id    UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    name            VARCHAR(20) NOT NULL,          -- e.g. '2026-27'
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_academic_year_name_per_institute UNIQUE (institute_id, name),
    CONSTRAINT ck_academic_year_date_order CHECK (end_date >= start_date)
);

-- Deliberately branch-wise to isolate data between branches.
CREATE TABLE classes (
    id              UUID PRIMARY KEY,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,           -- e.g. 'Class 8', 'UKG'
    sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_class_name_per_branch UNIQUE (branch_id, name)
);

CREATE TABLE subjects (
    id              UUID PRIMARY KEY,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    subject_code    VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_subject_name_per_branch UNIQUE (branch_id, name)
);

-- The actual, physical "Class 8 - Section A at the Jaipur branch, 2026-27".
-- Students, attendance, and per-section marks hang off this row. Cross-branch
-- comparisons go through classes.id, shared across every branch's equivalent.
CREATE TABLE class_sections (
    id                  UUID PRIMARY KEY,
    branch_id           UUID NOT NULL REFERENCES branches(id),
    class_id            UUID NOT NULL REFERENCES classes(id),
    academic_year_id    UUID NOT NULL REFERENCES academic_years(id),
    section_name        VARCHAR(20) NOT NULL,        -- e.g. 'A', 'B'
    class_teacher_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    max_strength        INTEGER CHECK (max_strength >= 0),
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_class_section_scope
        UNIQUE (branch_id, class_id, academic_year_id, section_name),
    CONSTRAINT ck_class_section_positive_capacity
        CHECK (max_strength IS NULL OR max_strength > 0)
);

CREATE TABLE subject_teacher_assignments (
    id                  UUID PRIMARY KEY,
    class_section_id    UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    subject_id          UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_section_subject_teacher UNIQUE (class_section_id, subject_id)
);

-- ============================================================================
-- SECTION 5: STUDENTS, PARENTS & ENROLLMENT
-- ============================================================================

CREATE SEQUENCE admission_number_seq START 1;

CREATE TABLE students (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id                   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    admission_number            VARCHAR(30) UNIQUE NOT NULL
                                    DEFAULT ('ADM' || LPAD(nextval('admission_number_seq')::TEXT, 8, '0')),

    full_name                    VARCHAR(150) NOT NULL,
    date_of_birth                 DATE NOT NULL,
    gender                         VARCHAR(20) CHECK (gender IN ('male','female','other')),
    photo_url                       VARCHAR(500),
    blood_group                      VARCHAR(5),
    allergies_medical_notes           TEXT,
    address                            TEXT,
    emergency_contact_name              VARCHAR(150),
    emergency_contact_phone              VARCHAR(20),

    admission_date                        DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active                              BOOLEAN NOT NULL DEFAULT TRUE,       -- soft delete for withdrawal/transfer
    withdrawal_date                         DATE,
    withdrawal_reason                        VARCHAR(255),

    created_at                                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kept separate from `students` so a student's full history across every
-- class/year they've been enrolled in is a clean query, not a table that
-- gets overwritten on every promotion.
CREATE TABLE student_enrollments (
    id                  UUID PRIMARY KEY,
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_section_id    UUID NOT NULL REFERENCES class_sections(id),
    academic_year_id    UUID NOT NULL REFERENCES academic_years(id),
    roll_number         VARCHAR(20) NOT NULL,          -- changes per class/year, unlike admission_number
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at             TIMESTAMPTZ,                    -- set if the student transferred out mid-year
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_section_roll_number UNIQUE (class_section_id, roll_number),
    CONSTRAINT uq_student_academic_year UNIQUE (student_id, academic_year_id),
    CONSTRAINT ck_enrollment_left_after_enrolled
        CHECK (left_at IS NULL OR left_at >= enrolled_at)
);

CREATE TABLE parent_student_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship        VARCHAR(20) NOT NULL DEFAULT 'guardian'
        CHECK (relationship IN ('father','mother','guardian')),
    is_primary_contact  BOOLEAN NOT NULL DEFAULT FALSE,
    linked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (parent_user_id, student_id)
);

-- Required under India's DPDP Act, 2023: verifiable parental consent,
-- recorded (not just implied), for processing a child's personal data.
CREATE TABLE consent_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    parent_user_id           UUID NOT NULL REFERENCES users(id),
    consent_type              VARCHAR(50) NOT NULL DEFAULT 'data_processing'
        CHECK (consent_type IN ('data_processing','photo_usage','leaderboard_display')),
    consented                   BOOLEAN NOT NULL,
    consent_text_version         VARCHAR(20) NOT NULL,      -- which version of the consent language was shown
    ip_address                     VARCHAR(45),
    consented_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECTION 6: ATTENDANCE
-- ============================================================================

CREATE TABLE attendance_records (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id                  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_section_id            UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    attendance_date              DATE NOT NULL,
    status                        VARCHAR(15) NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED','ON_LEAVE','present','absent','late','excused','on_leave')),
    marked_by                      UUID NOT NULL REFERENCES users(id),
    marked_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    synced_from_offline               BOOLEAN NOT NULL DEFAULT FALSE,
    parent_acknowledged                 BOOLEAN NOT NULL DEFAULT FALSE,
    parent_flagged_incorrect              BOOLEAN NOT NULL DEFAULT FALSE,

    UNIQUE (student_id, attendance_date)
);

CREATE TABLE attendance_audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id       UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    changed_by          UUID NOT NULL REFERENCES users(id),
    old_status          VARCHAR(10),
    new_status          VARCHAR(10) NOT NULL,
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason              VARCHAR(255)
);

-- ============================================================================
-- SECTION 6B: LEAVE APPLICATIONS (students via parents, and staff)
-- ============================================================================
-- One table for both: a student's leave (applied for by a parent, reviewed by
-- the class teacher/admin) and a staff member's leave (applied for by the
-- staff member, reviewed by the branch/institute admin) — `applicant_type`
-- tells them apart, and exactly one of student_id / staff_user_id is set.

CREATE TABLE leave_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_type      VARCHAR(10) NOT NULL CHECK (applicant_type IN ('student','staff')),
    student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
    staff_user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    applied_by          UUID NOT NULL REFERENCES users(id),   -- the parent, for a student application
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    reason              VARCHAR(500) NOT NULL,
    status              VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','cancelled')),
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    review_note         VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_leave_applicant CHECK (
        (applicant_type = 'student' AND student_id IS NOT NULL AND staff_user_id IS NULL)
     OR (applicant_type = 'staff'   AND staff_user_id IS NOT NULL AND student_id IS NULL)
    ),
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

-- ============================================================================
-- SECTION 6C: LEAVE TYPES, LEAVE BALANCES & ATTENDANCE ALERTS
-- ============================================================================

CREATE TABLE leave_types (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id        UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(20),
    description         TEXT,
    applicable_to       VARCHAR(10) NOT NULL DEFAULT 'both' CHECK (applicable_to IN ('student','staff','both')),
    applies_to          VARCHAR(10) NOT NULL DEFAULT 'both' CHECK (applies_to IN ('student','staff','both')),
    max_days_per_year   NUMERIC(5,2) NOT NULL DEFAULT 0,
    annual_quota_days   NUMERIC(5,2) NOT NULL DEFAULT 0,
    requires_document   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (institute_id, name)
);

CREATE TABLE leave_balances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
    leave_type_id       UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    academic_year_id    UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    total_allocated     NUMERIC(5,2) NOT NULL DEFAULT 0,
    allocated_days      NUMERIC(5,2) NOT NULL DEFAULT 0,
    used_days           NUMERIC(5,2) NOT NULL DEFAULT 0,
    pending_days        NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_leave_balance_owner CHECK (
        (user_id IS NOT NULL AND student_id IS NULL)
     OR (student_id IS NOT NULL AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX uq_user_leave_balance ON leave_balances(user_id, leave_type_id, academic_year_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_student_leave_balance ON leave_balances(student_id, leave_type_id, academic_year_id) WHERE student_id IS NOT NULL;

CREATE TABLE attendance_alert_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id                UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_id                   UUID REFERENCES branches(id) ON DELETE CASCADE,
    low_attendance_threshold   NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (low_attendance_threshold BETWEEN 0 AND 100),
    enable_parent_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    enable_auto_alerts          BOOLEAN NOT NULL DEFAULT TRUE,
    consecutive_absent_threshold INT NOT NULL DEFAULT 3,
    notify_parent               BOOLEAN NOT NULL DEFAULT TRUE,
    notify_class_teacher        BOOLEAN NOT NULL DEFAULT TRUE,
    notify_branch_admin         BOOLEAN NOT NULL DEFAULT FALSE,
    unmarked_reminder_time      TIME,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (institute_id, branch_id)
);

-- Schema Additions & Alterations for Attendance & Leave Management
ALTER TABLE leave_applications
    ADD COLUMN leave_type_id               UUID REFERENCES leave_types(id) ON DELETE SET NULL,
    ADD COLUMN document_url                VARCHAR(500),
    ADD COLUMN supporting_document_url     VARCHAR(500),
    ADD COLUMN rejection_reason            VARCHAR(500),
    ADD COLUMN total_days                  NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    ADD COLUMN half_day_type               VARCHAR(20) DEFAULT 'none' CHECK (half_day_type IN ('none', 'first_half', 'second_half')),
    ADD COLUMN auto_prefilled_attendance BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_check CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED','ON_LEAVE','present','absent','late','excused','on_leave'));
ALTER TABLE attendance_records ADD COLUMN leave_application_id UUID REFERENCES leave_applications(id) ON DELETE SET NULL;
ALTER TABLE attendance_records ADD COLUMN remark TEXT;
ALTER TABLE attendance_records ADD COLUMN capture_mode VARCHAR(15) NOT NULL DEFAULT 'manual' CHECK (capture_mode IN ('manual','qr','rfid','biometric','face'));
ALTER TABLE attendance_records ADD COLUMN period_id UUID;

-- ============================================================================
-- SECTION 7: ASSESSMENTS & MARKS
-- ============================================================================
-- An assessment is defined once at the institute level and linked to MANY
-- class_sections across MANY branches via `assessment_class_sections` — this
-- is what makes a single "Term 1 Common Math Test, Class 8" administered at
-- every branch on the same day count as one assessment for cross-branch
-- comparison, instead of several disconnected per-branch tests.

CREATE TABLE assessments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id            UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    academic_year_id        UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id                UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id              UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    name                    VARCHAR(150) NOT NULL,          -- e.g. 'Unit Test 1', 'Mid Term'
    term                    VARCHAR(50),
    max_marks               NUMERIC(6,2) NOT NULL,
    is_common_assessment    BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = held identically across branches
    assessment_date         DATE,
    created_by              UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assessment_class_sections (
    assessment_id       UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    class_section_id    UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    PRIMARY KEY (assessment_id, class_section_id)
);

CREATE TABLE marks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id       UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    marks_obtained      NUMERIC(6,2) NOT NULL CHECK (marks_obtained >= 0),
    remark              TEXT,
    entered_by          UUID NOT NULL REFERENCES users(id),
    entered_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at        TIMESTAMPTZ,                          -- NULL = draft, invisible to parents

    UNIQUE (assessment_id, student_id)
);

-- marks_obtained cannot exceed the assessment's max_marks. A CHECK constraint
-- can't reach across tables in Postgres, so this is enforced with a trigger.
CREATE OR REPLACE FUNCTION fn_validate_marks_within_max() RETURNS TRIGGER AS $$
DECLARE
    v_max NUMERIC(6,2);
BEGIN
    SELECT max_marks INTO v_max FROM assessments WHERE id = NEW.assessment_id;
    IF NEW.marks_obtained > v_max THEN
        RAISE EXCEPTION 'marks_obtained (%) cannot exceed assessment max_marks (%)', NEW.marks_obtained, v_max;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_marks
BEFORE INSERT OR UPDATE ON marks
FOR EACH ROW EXECUTE FUNCTION fn_validate_marks_within_max();

-- ============================================================================
-- SECTION 8: CIRCULARS
-- ============================================================================

CREATE TABLE circulars (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id    UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,   -- NULL = institute-wide, across all branches
    title           VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    attachment_url  VARCHAR(500),
    posted_by       UUID NOT NULL REFERENCES users(id),
    published_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zero rows here = targets everyone in the circular's institute/branch scope.
-- Rows present = targets only those specific class sections.
CREATE TABLE circular_targets (
    circular_id         UUID NOT NULL REFERENCES circulars(id) ON DELETE CASCADE,
    class_section_id    UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    PRIMARY KEY (circular_id, class_section_id)
);

CREATE TABLE generated_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id        UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
    document_type       VARCHAR(30) NOT NULL
        CHECK (document_type IN ('report_card','id_card','transfer_certificate','bonafide_certificate')),
    reference_id        UUID,           -- e.g. the assessment_id a report card was generated for
    file_url            VARCHAR(500) NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by        UUID REFERENCES users(id)
);

-- ============================================================================
-- SECTION 9: NOTIFICATIONS
-- ============================================================================

CREATE TABLE device_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token       VARCHAR(500) NOT NULL,
    platform        VARCHAR(10) NOT NULL CHECK (platform IN ('ios','android')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, fcm_token)
);

CREATE TABLE notification_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type  VARCHAR(30) NOT NULL
        CHECK (notification_type IN ('absence_alert','marks_published','circular','low_attendance','batch_awarded','leaderboard_rank_change')),
    reference_id        UUID,                                  -- points at the attendance_record/mark/circular/etc. that triggered this
    title                VARCHAR(255) NOT NULL,
    body                  TEXT,
    channel                VARCHAR(15) NOT NULL DEFAULT 'push' CHECK (channel IN ('push','sms','whatsapp','email')),
    delivery_status         VARCHAR(15) NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('queued','sent','delivered','failed')),
    sent_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at               TIMESTAMPTZ
);

-- ============================================================================
-- SECTION 10: GAMIFICATION — POINTS, ACTIVITIES & BATCHES
-- ============================================================================
-- Every point a student ever earns — from a test score, a sports win, a
-- discipline note, or a manually awarded recognition — is one row in
-- `point_transactions`. This is a LEDGER, not a running total, so a
-- student's full point history and every leaderboard slice can be
-- reconstructed and re-verified at any time.

CREATE TABLE point_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id    UUID REFERENCES institutes(id) ON DELETE CASCADE,   -- NULL = platform default, usable by every institute
    name            VARCHAR(100) NOT NULL,        -- Academics, Sports, Arts & Culture, Discipline, Attendance, Leadership, Community Service
    description     VARCHAR(255),
    icon            VARCHAR(50),

    UNIQUE (institute_id, name)
);

CREATE TABLE activity_types (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id            UUID REFERENCES institutes(id) ON DELETE CASCADE,  -- NULL = platform default; institutes can add custom ones too
    category_id             UUID NOT NULL REFERENCES point_categories(id) ON DELETE CASCADE,
    name                    VARCHAR(150) NOT NULL,      -- e.g. 'Won inter-branch sports match'
    default_points          INTEGER NOT NULL DEFAULT 0,
    requires_manual_award   BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE for auto-generated ones (e.g. assessment-based)
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (institute_id, name)
);

CREATE TABLE point_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    -- denormalized scope columns so leaderboard filters stay fast without
    -- re-joining through enrollment/assessment chains on every query
    institute_id        UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    class_id            UUID REFERENCES classes(id),
    subject_id          UUID REFERENCES subjects(id),               -- NULL for non-academic points
    academic_year_id    UUID NOT NULL REFERENCES academic_years(id),

    category_id         UUID NOT NULL REFERENCES point_categories(id),
    activity_type_id    UUID REFERENCES activity_types(id),          -- NULL when source_type = 'academic_assessment'
    source_type         VARCHAR(30) NOT NULL
        CHECK (source_type IN ('academic_assessment','attendance_streak','activity','batch_award','manual_admin_award')),
    source_reference_id UUID,       -- e.g. the assessments.id or student_batches.id that generated this row

    points              INTEGER NOT NULL,
    note                VARCHAR(255),
    awarded_by          UUID REFERENCES users(id),      -- NULL for system-auto-generated points
    awarded_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE batch_definitions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id            UUID REFERENCES institutes(id) ON DELETE CASCADE,  -- NULL = platform default batch; institutes can also define their own
    category_id             UUID REFERENCES point_categories(id),               -- NULL = overall/all-rounder batch
    name                    VARCHAR(100) NOT NULL,        -- e.g. 'Gold Performer', 'Rising Star'
    description             VARCHAR(255),
    badge_icon_url          VARCHAR(500),
    criteria_type           VARCHAR(20) NOT NULL
        CHECK (criteria_type IN ('points_threshold','rank_threshold','manual_award')),
    criteria_value          INTEGER,       -- points needed, or rank cutoff (e.g. 10 = top 10), per criteria_type
    validity_period         VARCHAR(15) NOT NULL DEFAULT 'termly'
        CHECK (validity_period IN ('monthly','termly','annual','permanent')),
    bonus_points_on_award   INTEGER NOT NULL DEFAULT 0,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (institute_id, name)
);

CREATE TABLE student_batches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_definition_id     UUID NOT NULL REFERENCES batch_definitions(id) ON DELETE CASCADE,
    academic_year_id        UUID NOT NULL REFERENCES academic_years(id),
    awarded_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from              DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until             DATE,                            -- NULL for 'permanent' batches
    awarded_by              UUID REFERENCES users(id)         -- NULL when auto-awarded (e.g. crossing a points threshold)
);

-- ============================================================================
-- SECTION 11: LEADERBOARDS
-- ============================================================================
-- Rankings are computed from `point_transactions`, not stored as a separate
-- source of truth. `leaderboard_snapshots` is a periodically refreshed cache
-- (e.g. nightly) for fast reads at scale; the views below are the equivalent
-- live queries — useful before caching is needed, and as the logic a
-- snapshot job should run.

CREATE TABLE leaderboard_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type          VARCHAR(20) NOT NULL
        CHECK (scope_type IN ('branch','institute','global_network')),
    institute_id        UUID REFERENCES institutes(id) ON DELETE CASCADE,   -- NULL only for scope_type = 'global_network'
    branch_id           UUID REFERENCES branches(id) ON DELETE CASCADE,     -- set only for scope_type = 'branch'
    class_id            UUID REFERENCES classes(id),                        -- optional filter
    subject_id          UUID REFERENCES subjects(id),                       -- optional filter (subject-specific leaderboard)
    academic_year_id    UUID NOT NULL REFERENCES academic_years(id),
    period_type         VARCHAR(15) NOT NULL DEFAULT 'all_time'
        CHECK (period_type IN ('all_time','monthly','termly','annual')),
    period_label        VARCHAR(30),                                        -- e.g. '2026-07' for a monthly snapshot

    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    total_points        INTEGER NOT NULL,
    rank                INTEGER NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A single, tested function rather than three fixed-shape views. Views that
-- GROUP BY class_id/subject_id directly turned out to split one student's
-- academic points and activity points into separate rows instead of a true
-- overall total (caught in testing — see the note at the end of this file).
-- Passing p_class_id / p_subject_id as NULL gives the genuine overall
-- leaderboard; passing a value filters to that class/subject specifically.
CREATE OR REPLACE FUNCTION fn_leaderboard(
    p_scope_type        VARCHAR,     -- 'branch' | 'institute' | 'global_network'
    p_institute_id       UUID DEFAULT NULL,
    p_branch_id           UUID DEFAULT NULL,
    p_class_id             UUID DEFAULT NULL,   -- optional filter
    p_subject_id             UUID DEFAULT NULL, -- optional filter
    p_academic_year_id         UUID DEFAULT NULL
) RETURNS TABLE (
    student_id UUID, student_name VARCHAR, institute_name VARCHAR,
    branch_name VARCHAR, total_points BIGINT, rank BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE WHEN p_scope_type = 'global_network' THEN NULL::UUID ELSE pt.student_id END,
        CASE WHEN p_scope_type = 'global_network' THEN NULL::VARCHAR ELSE s.full_name END,
        i.display_name, b.name,
        SUM(pt.points)::BIGINT AS total_points,
        RANK() OVER (ORDER BY SUM(pt.points) DESC)::BIGINT AS rank
    FROM point_transactions pt
    JOIN students s ON s.id = pt.student_id
    JOIN institutes i ON i.id = pt.institute_id
    JOIN branches b ON b.id = pt.branch_id
    WHERE (
            (p_scope_type = 'branch' AND pt.branch_id = p_branch_id)
         OR (p_scope_type = 'institute' AND pt.institute_id = p_institute_id)
         OR (p_scope_type = 'global_network' AND i.participate_in_global_leaderboard = TRUE)
          )
      -- Until the dedicated privacy-settings migration exists, network rows
      -- are anonymous and require the student's latest leaderboard consent.
      AND (
            p_scope_type <> 'global_network'
            OR COALESCE((
                SELECT cr.consented
                FROM consent_records cr
                WHERE cr.student_id = pt.student_id
                  AND cr.consent_type = 'leaderboard_display'
                ORDER BY cr.consented_at DESC, cr.id DESC
                LIMIT 1
            ), FALSE)
          )
      AND (p_class_id IS NULL OR pt.class_id = p_class_id)
      AND (p_subject_id IS NULL OR pt.subject_id = p_subject_id)
      AND (p_academic_year_id IS NULL OR pt.academic_year_id = p_academic_year_id)
    GROUP BY pt.student_id, s.full_name, i.display_name, b.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Examples:
--   Overall institute leaderboard:  SELECT * FROM fn_leaderboard('institute', p_institute_id := '...');
--   Subject-only leaderboard:       SELECT * FROM fn_leaderboard('institute', p_institute_id := '...', p_subject_id := '...');
--   One branch only:                SELECT * FROM fn_leaderboard('branch', p_branch_id := '...');
--   Cross-institute network:        SELECT * FROM fn_leaderboard('global_network');

-- ============================================================================
-- SECTION 12: AUDIT LOG (generic, cross-cutting)
-- ============================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id    UUID REFERENCES institutes(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,        -- e.g. 'student.update', 'marks.publish'
    entity_table    VARCHAR(50) NOT NULL,
    entity_id       UUID NOT NULL,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECTION 13: ROW-LEVEL SECURITY (tenant isolation)
-- ============================================================================
-- The application sets these session variables right after authenticating
-- a request:
--   SET app.current_institute_id = '<uuid>';
-- Every tenant-scoped table then enforces isolation at the database level —
-- a bug in application code cannot leak one institute's data into another's,
-- even through the Django admin.

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_isolation ON branches
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE access_control_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_isolation ON access_control_role
    USING (institute_id IS NULL OR institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE access_control_userroleassignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_role_assignments_isolation ON access_control_userroleassignment
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE admin_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_records_isolation ON admin_records
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY academic_years_isolation ON academic_years
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY classes_isolation ON classes
    USING (branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID));

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY subjects_isolation ON subjects
    USING (branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID));

ALTER TABLE class_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_sections_isolation ON class_sections
    USING (branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID));

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY students_isolation ON students
    USING (branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID));

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_isolation ON attendance_records
    USING (student_id IN (SELECT id FROM students WHERE branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID)));

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY assessments_isolation ON assessments
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY marks_isolation ON marks
    USING (assessment_id IN (SELECT id FROM assessments WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID));

ALTER TABLE circulars ENABLE ROW LEVEL SECURITY;
CREATE POLICY circulars_isolation ON circulars
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE point_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY point_categories_isolation ON point_categories
    USING (institute_id IS NULL OR institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE activity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_types_isolation ON activity_types
    USING (institute_id IS NULL OR institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY point_transactions_isolation ON point_transactions
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE batch_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY batch_definitions_isolation ON batch_definitions
    USING (institute_id IS NULL OR institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE student_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_batches_isolation ON student_batches
    USING (student_id IN (SELECT id FROM students WHERE branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID)));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_isolation ON audit_logs
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_applications_isolation ON leave_applications
    USING (branch_id IN (SELECT id FROM branches WHERE institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID));

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY generated_documents_isolation ON generated_documents
    USING (institute_id = NULLIF(current_setting('app.current_institute_id', true), '')::UUID);

-- The global/cross-institute leaderboard is the one deliberate exception to
-- "each institute only sees its own data." Rather than complicate the policy
-- above with cross-tenant logic, give the specific backend service that
-- powers the global leaderboard its own Postgres role with BYPASSRLS, and
-- let it query ONLY v_leaderboard_global (which already filters to
-- participate_in_global_leaderboard = TRUE institutes):
--   CREATE ROLE global_leaderboard_reader LOGIN PASSWORD '<set-in-secrets>' BYPASSRLS;
--   GRANT SELECT ON v_leaderboard_global TO global_leaderboard_reader;

-- ============================================================================
-- SECTION 14: INDEXES
-- ============================================================================

CREATE INDEX idx_branches_institute ON branches(institute_id);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX access_control_permission_permission_key_66e91761_like
    ON access_control_permission(permission_key varchar_pattern_ops);
CREATE INDEX ac_perm_module_active_idx
    ON access_control_permission(module, is_active);
CREATE INDEX ac_role_scope_active_idx
    ON access_control_role(institute_id, branch_id, is_active);
CREATE INDEX ac_role_system_active_idx
    ON access_control_role(is_system_role, is_active);
CREATE INDEX access_control_role_branch_id_fed2b7cc ON access_control_role(branch_id);
CREATE INDEX access_control_role_created_by_id_d7fe5b68 ON access_control_role(created_by_id);
CREATE INDEX access_control_role_institute_id_809c2fe3 ON access_control_role(institute_id);
CREATE INDEX ac_rp_permission_role_idx
    ON access_control_rolepermission(permission_id, role_id);
CREATE INDEX access_control_rolepermission_permission_id_e0eb4600
    ON access_control_rolepermission(permission_id);
CREATE INDEX access_control_rolepermission_role_id_50581715
    ON access_control_rolepermission(role_id);
CREATE INDEX ac_assignment_effective_idx
    ON access_control_userroleassignment(user_id, institute_id, branch_id, is_active);
CREATE INDEX ac_assignment_role_idx
    ON access_control_userroleassignment(institute_id, role_id, is_active);
CREATE INDEX ac_assignment_expiry_idx
    ON access_control_userroleassignment(valid_until, is_active);
CREATE INDEX access_control_userroleassignment_assigned_by_id_5855d6a9
    ON access_control_userroleassignment(assigned_by_id);
CREATE INDEX access_control_userroleassignment_branch_id_597d9661
    ON access_control_userroleassignment(branch_id);
CREATE INDEX access_control_userroleassignment_institute_id_2c57f7e2
    ON access_control_userroleassignment(institute_id);
CREATE INDEX access_control_userroleassignment_revoked_by_id_4dd9e6fb
    ON access_control_userroleassignment(revoked_by_id);
CREATE INDEX access_control_userroleassignment_role_id_3f086460
    ON access_control_userroleassignment(role_id);
CREATE INDEX access_control_userroleassignment_user_id_eb2794aa
    ON access_control_userroleassignment(user_id);
CREATE INDEX admin_records_branch_id_966a9d9d ON admin_records(branch_id);
CREATE INDEX admin_records_created_by_id_3ea05a0f ON admin_records(created_by_id);
CREATE INDEX admin_records_institute_id_3522c03e ON admin_records(institute_id);
CREATE INDEX admrec_tenant_screen_idx
    ON admin_records(institute_id, screen_id, is_active, updated_at DESC);
CREATE INDEX admrec_branch_screen_idx
    ON admin_records(institute_id, branch_id, screen_id, is_active);
CREATE INDEX admrec_screen_status_idx
    ON admin_records(institute_id, screen_id, status, is_active);
CREATE INDEX academic_ye_institu_53d841_idx
    ON academic_years(institute_id, is_current, start_date);
CREATE INDEX academic_years_institute_id_0884e211 ON academic_years(institute_id);
CREATE UNIQUE INDEX uq_current_academic_year_per_institute
    ON academic_years(institute_id) WHERE is_current;
CREATE INDEX classes_institu_7d146f_idx ON classes(branch_id, sort_order, name);
CREATE INDEX classes_institute_id_e4ef3195 ON classes(branch_id);
CREATE INDEX class_secti_branch__6eefdd_idx ON class_sections(branch_id, academic_year_id);
CREATE INDEX class_secti_class_i_46f3ac_idx ON class_sections(class_id, academic_year_id);
CREATE INDEX class_sections_academic_year_id_8776962d ON class_sections(academic_year_id);
CREATE INDEX class_sections_branch_id_206bf4a8 ON class_sections(branch_id);
CREATE INDEX class_sections_class_teacher_id_0f5f0b2e ON class_sections(class_teacher_id);
CREATE INDEX class_sections_class_id_13a70f19 ON class_sections(class_id);
CREATE INDEX student_enr_student_754696_idx ON student_enrollments(student_id);
CREATE INDEX student_enr_class_s_76042a_idx
    ON student_enrollments(class_section_id, academic_year_id);
CREATE INDEX student_enr_academi_f0242f_idx ON student_enrollments(academic_year_id, left_at);
CREATE INDEX student_enrollments_academic_year_id_0fdd3fc6 ON student_enrollments(academic_year_id);
CREATE INDEX student_enrollments_class_section_id_b1031e10 ON student_enrollments(class_section_id);
CREATE INDEX student_enrollments_student_id_8f9115cb ON student_enrollments(student_id);
CREATE INDEX subjects_institu_e27355_idx ON subjects(branch_id, name);
CREATE INDEX subjects_institute_id_7a35a2aa ON subjects(branch_id);
CREATE UNIQUE INDEX uq_subject_code_per_institute
    ON subjects(branch_id, subject_code) WHERE subject_code <> '';
CREATE INDEX subject_tea_class_s_a49ff8_idx
    ON subject_teacher_assignments(class_section_id, teacher_id);
CREATE INDEX subject_tea_teacher_605058_idx
    ON subject_teacher_assignments(teacher_id, class_section_id);
CREATE INDEX subject_teacher_assignments_class_section_id_ef6cde8c
    ON subject_teacher_assignments(class_section_id);
CREATE INDEX subject_teacher_assignments_subject_id_fa98948f
    ON subject_teacher_assignments(subject_id);
CREATE INDEX subject_teacher_assignments_teacher_id_27eb059d
    ON subject_teacher_assignments(teacher_id);
CREATE INDEX idx_students_institute ON students(branch_id) WHERE is_active = TRUE;
CREATE INDEX idx_parent_links_parent ON parent_student_links(parent_user_id);
CREATE INDEX idx_parent_links_student ON parent_student_links(student_id);
CREATE INDEX idx_attendance_student_date ON attendance_records(student_id, attendance_date);
CREATE INDEX idx_attendance_section_date ON attendance_records(class_section_id, attendance_date);
CREATE INDEX idx_assessments_class_subject ON assessments(institute_id, class_id, subject_id, academic_year_id);
CREATE INDEX idx_marks_student ON marks(student_id) WHERE published_at IS NOT NULL;
CREATE INDEX idx_marks_assessment ON marks(assessment_id);
CREATE INDEX idx_circulars_institute_branch ON circulars(institute_id, branch_id);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_notification_user ON notification_log(user_id, sent_at DESC);
CREATE INDEX idx_points_student ON point_transactions(student_id);
CREATE INDEX idx_points_leaderboard_branch ON point_transactions(branch_id, academic_year_id, class_id, subject_id);
CREATE INDEX idx_points_leaderboard_institute ON point_transactions(institute_id, academic_year_id, class_id, subject_id);
CREATE INDEX idx_student_batches_student ON student_batches(student_id);
CREATE INDEX idx_leaderboard_snapshot_lookup ON leaderboard_snapshots(
    scope_type, institute_id, branch_id, class_id, subject_id,
    academic_year_id, period_type, period_label, computed_at DESC
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_table, entity_id);
CREATE INDEX idx_leave_applications_branch_status ON leave_applications(branch_id, status);
CREATE INDEX idx_leave_applications_student ON leave_applications(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX idx_leave_applications_staff ON leave_applications(staff_user_id) WHERE staff_user_id IS NOT NULL;
CREATE INDEX idx_generated_documents_student ON generated_documents(student_id) WHERE student_id IS NOT NULL;

-- ============================================================================
-- SECTION 15: SEED DATA
-- ============================================================================

-- ---- Permissions (platform-wide master list) ----
INSERT INTO access_control_permission (
    id, permission_key, module, description, is_active, created_at, updated_at
)
SELECT gen_random_uuid(), seed.permission_key, seed.module, seed.description,
       TRUE, now(), now()
FROM (VALUES
('institute.manage_settings',    'institute',   'Edit institute profile, branding, and academic configuration'),
('institute.manage_branches',    'institute',   'Create, edit, or deactivate branches'),
('institute.view_all_branches',  'institute',   'View data across every branch of the institute'),
('staff.invite',                 'staff',       'Invite new staff members'),
('staff.manage',                 'staff',       'Edit or deactivate staff accounts'),
('role.create',                  'roles',       'Create custom roles'),
('role.assign',                  'roles',       'Assign roles to users'),
('role.manage_permissions',      'roles',       'Edit which permissions a role grants'),
('student.create',               'students',    'Add new students'),
('student.edit',                 'students',    'Edit student profiles'),
('student.delete',               'students',    'Deactivate/withdraw a student'),
('student.view',                 'students',    'View student profiles'),
('attendance.mark',              'attendance',  'Mark daily attendance'),
('attendance.edit',              'attendance',  'Edit previously marked attendance'),
('attendance.view_own_class',    'attendance',  'View attendance for own assigned class(es)'),
('attendance.view_branch',       'attendance',  'View attendance across a branch'),
('attendance.view_institute',    'attendance',  'View attendance across all branches'),
('assessment.create',            'academics',   'Create assessments/exams'),
('marks.enter',                  'academics',   'Enter marks for own subject/class'),
('marks.publish',                'academics',   'Publish marks so parents can see them'),
('marks.view_own_class',         'academics',   'View marks for own assigned class(es)'),
('marks.view_branch',            'academics',   'View marks across a branch'),
('marks.view_institute',         'academics',   'View marks across all branches'),
('circular.post_class',          'communication','Post a circular to a specific class'),
('circular.post_branch',         'communication','Post a circular to a whole branch'),
('circular.post_institute',      'communication','Post a circular institute-wide'),
('leaderboard.view',             'leaderboard', 'View leaderboards'),
('leaderboard.configure',        'leaderboard', 'Configure leaderboard visibility and scope'),
('points.award_manual',          'leaderboard', 'Manually award points or batches to a student'),
('reports.view_branch',          'reports',     'View analytics/reports for a branch'),
('reports.view_institute',       'reports',     'View analytics/reports across all branches')
) AS seed(permission_key, module, description);

-- ---- System default roles (institute_id NULL = available to every institute) ----
INSERT INTO access_control_role (
    id, institute_id, branch_id, name, description, is_system_role,
    is_active, created_at, updated_at
) VALUES
('00000000-0000-0000-0000-000000000001', NULL, NULL, 'Institute Admin', 'Full control within one institute, across all its branches', TRUE, TRUE, now(), now()),
('00000000-0000-0000-0000-000000000002', NULL, NULL, 'Branch Admin',    'Full control within one branch only', TRUE, TRUE, now(), now()),
('00000000-0000-0000-0000-000000000003', NULL, NULL, 'Teacher',         'Manages attendance, marks, and remarks for assigned classes', TRUE, TRUE, now(), now()),
('00000000-0000-0000-0000-000000000004', NULL, NULL, 'Parent',          'Views their own child/children only', TRUE, TRUE, now(), now());

INSERT INTO access_control_rolepermission (role_id, permission_id, configuration, granted_at)
SELECT '00000000-0000-0000-0000-000000000001', id, '{}'::JSONB, now()
FROM access_control_permission; -- Institute Admin: everything

INSERT INTO access_control_rolepermission (role_id, permission_id, configuration, granted_at)
SELECT '00000000-0000-0000-0000-000000000002', id, '{}'::JSONB, now()
FROM access_control_permission
WHERE permission_key NOT IN ('institute.manage_branches','institute.view_all_branches','attendance.view_institute','marks.view_institute','reports.view_institute','circular.post_institute');

INSERT INTO access_control_rolepermission (role_id, permission_id, configuration, granted_at)
SELECT '00000000-0000-0000-0000-000000000003', id, '{}'::JSONB, now()
FROM access_control_permission
WHERE permission_key IN ('attendance.mark','attendance.view_own_class','marks.enter','marks.view_own_class','circular.post_class','student.view','points.award_manual','leaderboard.view');

INSERT INTO access_control_rolepermission (role_id, permission_id, configuration, granted_at)
SELECT '00000000-0000-0000-0000-000000000004', id, '{}'::JSONB, now()
FROM access_control_permission
WHERE permission_key IN ('attendance.view_own_class','marks.view_own_class','leaderboard.view');

-- ---- Point categories (platform default, institute_id NULL) ----
INSERT INTO point_categories (id, institute_id, name, description, icon) VALUES
('00000000-0000-0000-0000-000000000101', NULL, 'Academics',            'Test scores, assignments, and academic achievement', 'book'),
('00000000-0000-0000-0000-000000000102', NULL, 'Sports',               'Athletic participation and achievement', 'medal'),
('00000000-0000-0000-0000-000000000103', NULL, 'Arts & Culture',       'Music, art, drama, and cultural events', 'palette'),
('00000000-0000-0000-0000-000000000104', NULL, 'Discipline & Conduct', 'Behavior and adherence to school values', 'shield'),
('00000000-0000-0000-0000-000000000105', NULL, 'Attendance',           'Punctuality and consistent presence', 'calendar'),
('00000000-0000-0000-0000-000000000106', NULL, 'Leadership',           'Student leadership and responsibility roles', 'star'),
('00000000-0000-0000-0000-000000000107', NULL, 'Community Service',    'Volunteering and community contribution', 'heart');

-- ---- Activity types (platform default; institutes can add their own) ----
INSERT INTO activity_types (institute_id, category_id, name, default_points, requires_manual_award) VALUES
(NULL, '00000000-0000-0000-0000-000000000102', 'Won inter-branch sports match', 50, TRUE),
(NULL, '00000000-0000-0000-0000-000000000102', 'Represented school at district/state level', 75, TRUE),
(NULL, '00000000-0000-0000-0000-000000000102', 'Participated in school sports day', 10, TRUE),
(NULL, '00000000-0000-0000-0000-000000000103', 'Won an art/music/dance competition', 40, TRUE),
(NULL, '00000000-0000-0000-0000-000000000103', 'Performed at a school event', 20, TRUE),
(NULL, '00000000-0000-0000-0000-000000000104', 'Positive behavior recognition', 15, TRUE),
(NULL, '00000000-0000-0000-0000-000000000104', 'Zero conduct complaints for the term', 25, TRUE),
(NULL, '00000000-0000-0000-0000-000000000105', 'Perfect attendance for the month', 20, TRUE),
(NULL, '00000000-0000-0000-0000-000000000105', 'Punctuality streak (30 days, zero late marks)', 15, TRUE),
(NULL, '00000000-0000-0000-0000-000000000106', 'Served as class monitor/prefect', 20, TRUE),
(NULL, '00000000-0000-0000-0000-000000000106', 'Led a school event or initiative', 30, TRUE),
(NULL, '00000000-0000-0000-0000-000000000107', 'Volunteered for a school/community event', 20, TRUE);

-- ---- Batch definitions ("all possible batches"; institute_id NULL = platform default, institutes can add more) ----
INSERT INTO batch_definitions (institute_id, category_id, name, description, criteria_type, criteria_value, validity_period, bonus_points_on_award) VALUES
(NULL, NULL, 'Best Performer Batch',        'Highest overall points across all categories this term', 'rank_threshold', 1, 'termly', 100),
(NULL, NULL, 'All-Rounder Batch',            'Meaningful points earned in at least 4 different categories', 'manual_award', NULL, 'termly', 75),
(NULL, NULL, 'Topper Batch',                 'Rank 1 academically in class for the term', 'rank_threshold', 1, 'termly', 100),
(NULL, NULL, 'Merit Batch',                  'Top 10 academically in class for the term', 'rank_threshold', 10, 'termly', 40),
(NULL, NULL, 'Most Improved — Academics',    'Largest positive change in academic rank vs. previous term', 'manual_award', NULL, 'termly', 50),
(NULL, '00000000-0000-0000-0000-000000000102', 'Sports Champion',        'Outstanding achievement in sports this term', 'manual_award', NULL, 'termly', 60),
(NULL, '00000000-0000-0000-0000-000000000102', 'Athletic Excellence',    'Crossed the sports points threshold for the term', 'points_threshold', 100, 'termly', 30),
(NULL, '00000000-0000-0000-0000-000000000103', 'Creative Star',          'Outstanding achievement in arts/culture this term', 'manual_award', NULL, 'termly', 60),
(NULL, '00000000-0000-0000-0000-000000000103', 'Cultural Ambassador',    'Represented the school in cultural events', 'manual_award', NULL, 'annual', 50),
(NULL, '00000000-0000-0000-0000-000000000104', 'Discipline Star',        'Crossed the discipline & conduct points threshold', 'points_threshold', 75, 'termly', 30),
(NULL, '00000000-0000-0000-0000-000000000104', 'Best Conduct',           'Recognized for exemplary conduct', 'manual_award', NULL, 'termly', 40),
(NULL, '00000000-0000-0000-0000-000000000105', 'Perfect Attendance',     '100% attendance for the month', 'manual_award', NULL, 'monthly', 20),
(NULL, '00000000-0000-0000-0000-000000000105', 'Punctuality Star',       'Zero late marks for the term', 'manual_award', NULL, 'termly', 20),
(NULL, '00000000-0000-0000-0000-000000000106', 'Student Leader',         'Held a leadership role this term', 'manual_award', NULL, 'termly', 40),
(NULL, '00000000-0000-0000-0000-000000000106', 'Class Monitor Excellence','Outstanding performance as class monitor/prefect', 'manual_award', NULL, 'termly', 40),
(NULL, '00000000-0000-0000-0000-000000000107', 'Community Champion',     'Outstanding volunteering/community contribution', 'manual_award', NULL, 'termly', 40),
(NULL, NULL, 'Rising Star',                  'Most improved overall performer (any category) this term', 'manual_award', NULL, 'termly', 50),
(NULL, NULL, 'Student of the Month',         'Rank 1 overall across all branches for the month', 'rank_threshold', 1, 'monthly', 60);

-- ============================================================================
-- SECTION 14: ATTENDANCE & LEAVE MANAGEMENT ADDITIONS
-- ============================================================================
-- (Consolidated into Section 6C)

