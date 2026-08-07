# School management & CRM platform — complete feature specification

## What this platform actually is

You're combining two product categories that are usually sold separately: a school ERP (day-to-day records — attendance, exams, staff) and a school CRM (the admissions pipeline and ongoing parent relationship). That combination, sold as multi-tenant SaaS to many schools, is exactly what category leaders like Fedena, Teachmint, Entab, and Classter have built. Everything below is grounded in what those platforms actually ship today, organized by who uses it.

One clarification worth flagging: your three roles (admin, teachers, parents) all sit *inside* one institute. Since "multiple institutes register on this platform," there's implicitly a fourth role above them — you, the platform owner, who onboards and manages the institutes themselves. That's included below as role zero.

## 1. Platform architecture: making multi-tenancy work

- **Self-service institute onboarding** — a school signs up, picks a plan, and gets its own workspace, typically a subdomain (`schoolname.yourapp.com`)
- **Hard data isolation between tenants** — every record scoped to an `institute_id`; School A must never see School B's students, staff, or finances. Cheapest approach: one shared database with a tenant-ID column on every table. More isolated: separate schema per tenant. Most isolated and most expensive: separate database per tenant. Most platforms start with the first and only move large customers to the second if they demand it.
- **Per-institute branding** — logo, letterhead, and color theme carried through to report cards, ID cards, and notices
- **Per-institute academic configuration** — academic year, grading scale, number of terms, language, currency
- **Plan-based feature gating** — this is also your monetization lever (see section 6)

## 2. The four roles and what each can do

| Role | Scope | Core permissions |
|---|---|---|
| Platform super admin (you) | All institutes | Approve/onboard new institutes, manage plans & billing, platform-wide usage analytics, suspend a tenant, push updates |
| Institute admin / management | One institute | Staff onboarding, class/section setup, fee structure, admissions, institute-wide circulars, academic calendar, full reports for their own institute only |
| Teachers & staff | Their assigned classes/subjects only | Mark attendance, enter marks, add remarks, upload homework, message parents, apply for leave |
| Parents & students | Their own child/children only | View attendance, performance, and history; receive notifications; pay fees; message teachers; apply for leave |

## 3. Feature modules

### A. Admissions & CRM — the piece that makes this a CRM, not just an ERM

This is the genuinely differentiated half of your product, and it's worth building well:

- Enquiry capture from every channel into one inbox — website form, Meta/Google ads, walk-ins, phone, referrals
- Auto-assignment of new enquiries to admission counselors (round-robin or by workload)
- Lead scoring to flag which prospective parents are likely to enroll
- Automated WhatsApp/SMS/email nurture sequences until a parent books a visit or applies
- No-code application form builder, with document upload (birth certificate, transfer certificate, previous marksheets)
- Application-fee collection built into the form (UPI, card, net banking)
- Campus visit and entrance-test scheduling with reminders
- Enquiry-to-enrollment funnel reporting — see exactly where prospective parents drop off
- Duplicate-enquiry detection and OTP-verified contact capture
- Cross-institute comparison for admins running multiple branches
- The same contact record carries forward after enrollment, so admissions history and ongoing parent communication live in one place

### B. Student information system

- Full student profile: photo, DOB, contact info, address, blood group, allergies/medical notes, emergency contacts, prior-school records
- Class/section/roll assignment, mid-year section transfers
- Bulk student import (Excel/CSV) for new academic year rollovers
- Auto-generated ID cards with QR/barcode (doubles as an attendance-scan credential)
- Sibling linking, so one parent login sees every enrolled child
- Document vault per student — report cards, certificates, transfer certificate, medical records
- Alumni records retained after a student leaves, for future TC or verification requests

### C. Attendance management

- Daily attendance, class-wise and — for higher grades — period/subject-wise
- Multiple capture modes: manual tap, QR scan, RFID card, biometric, or face recognition for larger campuses
- Instant parent notification the moment a child is marked absent, via push, SMS, and/or WhatsApp (WhatsApp Business API is the dominant channel for Indian parents specifically)
- Two-way acknowledgment — a parent can confirm the absence or flag "my child is actually here" straight from the alert
- Parent-side leave application, routed to the teacher or admin for approval
- Automatic low-attendance alerts (many Indian boards use a 75% eligibility threshold) to both parent and admin
- Monthly/yearly attendance reports, exportable
- Separate staff attendance (biometric/manual), often tied into payroll
- Offline-first capture for low-connectivity campuses, syncing once back online

### D. Academic performance & examinations

- Exam/test builder for unit tests, class tests, mid-terms, and annual exams, or any custom assessment
- Subject-teacher marks entry with validation
- Configurable grading — percentage, GPA, letter grades, or a custom rubric
- Auto-generated, brandable PDF report cards (school letterhead, signatures, remarks)
- Full multi-year history for parents — every test, every term, every year the child has completed, not only the current one
- Subject-wise trend graphs across terms
- Class rank/percentile/class-average comparison (configurable — some schools deliberately hide rank)
- Teacher remarks per student per term, plus optional tags ("needs support in reading")
- Co-scholastic tracking — sports, arts, discipline, values
- Optional NEP 2020-style Holistic Progress Card for Indian CBSE/state-board schools: self-, peer-, and teacher-assessment across cognitive, socio-emotional, and life-skill domains
- At-risk flagging — auto-highlight students whose attendance or grades have dropped sharply

### E. Parent dashboard & communication

- One dashboard per child: attendance %, latest scores, homework due, fee dues, latest notices, at a glance
- Multi-child support under one login
- Configurable notification preferences by channel and urgency
- Direct, scoped messaging with a child's own teachers
- Parent-teacher meeting scheduler with slot booking
- School-wide circulars with read-receipt tracking for admin
- Emergency broadcast that overrides normal notification preferences

### F. Homework & digital classroom

- Assignment creation with due dates, submission (file/photo), and grading
- Shared study material — notes, links, recorded lessons
- Optional practice quizzes
- Syllabus-completion tracker, visible to parents and admin

### G. Fees & finance

- Class-wise/category-wise fee structure, one-time and recurring
- Online payment — UPI, cards, net banking (Razorpay, PayU, Cashfree are the common India-first gateways)
- Automated reminders before and after due dates
- Installments, sibling discounts, scholarships, RTE quota handling
- GST-compliant receipts and invoices
- Defaulter reports for admin
- Refund handling for withdrawals or transfers

### H. Timetable & scheduling

- Class and teacher timetable builder with clash detection
- Substitute-teacher management during leave
- Exam schedule publishing
- Shared academic calendar — holidays, exams, events, PTM days

### I. HR & staff management

- Staff records, contracts, documents
- Leave application and approval, separate from student leave
- Optional payroll integration
- Role-based access so a teacher only ever sees their own classes

### J. Transport, library, hostel (add-on modules)

- Transport — routes, GPS bus tracking, "bus arriving" parent alerts
- Library — catalog, issue/return, fine calculation
- Hostel — room allocation, visitor log, meal tracking

### K. Communication engine (shared plumbing behind everything above)

- Push notification as the default free channel, SMS/WhatsApp as a paid, more reliable fallback
- Bulk circulars with delivery and read tracking
- Message templates for repetitive sends (absence, fee reminder, low attendance)

### L. Reports & analytics

- Institute admin: attendance, performance, fee collection, and admissions-conversion trends in one dashboard
- Teacher: class performance summary, at-a-glance list of students needing attention
- Parent: their own child's view only
- Export to PDF/Excel; a custom report builder is a reasonable later-phase add-on

### M. Later-phase / nice-to-have

- AI-based at-risk prediction, combining attendance, grades, and behavior flags
- Chatbot for routine parent questions ("when is the fee due")
- Multi-language UI
- Visitor/gate-pass management
- Alumni network

## 4. Data privacy & compliance — build this in from day one

Since this handles children's data at scale, this isn't optional polish:

- **India's DPDP Act, 2023** defines anyone under 18 as a child and requires verifiable parental consent before processing their personal data. It specifically bans behavioral tracking, monitoring, and targeted advertising directed at children — no ad-tech or engagement-optimization patterns anywhere near this product.
- Schools are typically the "Data Fiduciary" under the Act; your platform is typically the "Data Processor." Build consent capture and clear data-processing terms into institute onboarding itself, not as an afterthought.
- Practice data minimization, define a retention/deletion policy (e.g., auto-archive a student's record after they graduate rather than keeping it indefinitely), and have a breach-notification process ready.
- If you ever expand outside India, FERPA (US) and GDPR (EU) apply similar principles — parental consent, minimization, right to access or delete.
- Practically: encrypt data at rest and in transit, enforce strict role-based access so, say, a Section A teacher can never see Section B's students, and keep an audit log of who viewed or edited each record.

## 5. A workable tech approach

- Common stack for this category: React or Next.js on the frontend, Node.js/Express or Django on the backend, PostgreSQL (its row-level security is genuinely useful for tenant isolation), React Native or Flutter for the parent and teacher mobile apps
- Start multi-tenancy with a shared database plus an `institute_id` column on every table — cheapest to build, and enough for most schools. Move only your largest customers to isolated schemas later if they specifically require it.
- Plan for WhatsApp Business API (via Gupshup, Twilio, or Meta directly) from the start — for Indian parents specifically, it's close to a non-negotiable channel, not an add-on

## 6. A workable subscription model

- Per-student-per-year pricing is the industry norm, often layered with a small flat platform fee
- Typical tiering: **Basic** (records + attendance), **Premium** (+ exams/report cards + full communication), **Enterprise** (+ admissions CRM + transport/library/hostel + custom branding + API access)
- A generous free tier (e.g., free up to 50 students) is a common way to land small schools before they commit to paying

## 7. What to actually build first

This list is long on purpose — you asked for everything possible. Building all of it before your first school goes live would take too long. A realistic phased build:

| Phase | Focus |
|---|---|
| 1 — MVP | Institute onboarding, student records, attendance + parent notifications, marks entry + report cards, parent dashboard, basic circulars |
| 2 | Fee management, timetable, homework module, admissions CRM |
| 3 | Transport/library/hostel, advanced analytics, AI features, multi-language |

If it would help, the natural next step is turning phase 1 into an actual database schema and screen-by-screen spec.
