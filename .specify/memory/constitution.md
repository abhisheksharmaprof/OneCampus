<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles:
  - Placeholder Principle 1 -> I. Production-Ready by Default
  - Placeholder Principle 2 -> II. Automated Verification Is Mandatory
  - Placeholder Principle 3 -> III. Scope Isolation and Regression Safety
  - Placeholder Principle 4 -> IV. Secure, Scalable, and Maintainable Architecture
  - V. Usable, Accessible, and Observable Experiences -> expanded with actionable error handling
- Added guidance:
  - User-correctable API and UI error responses
  - Error-contract requirements for field, authentication, permission, conflict, and server errors
- Removed sections: none
- Follow-up TODOs: none
- Removed sections: none
- Follow-up TODOs: none
-->
# CampusOne Constitution

## Core Principles

### I. Production-Ready by Default
Every feature, fix, migration, API, background task, and user interface MUST be complete enough to
operate safely in production. A change is complete only when it includes input validation, secure
authorization, deliberate error handling, loading and empty states where relevant, operationally
useful logging, documentation for non-obvious behavior, and a safe migration or rollback strategy
when data or contracts change. Placeholder implementations, silent failures, hard-coded production
values, exposed secrets, and known critical defects MUST NOT be shipped.

Production readiness MUST be demonstrated by evidence appropriate to the change, not asserted from
appearance alone. The evidence MUST include passing automated checks and, for user-facing workflows,
a realistic end-to-end or documented manual verification of the primary path and important failure
paths. This principle exists because a feature that works only in a developer's happy path is not a
finished feature.

### II. Automated Verification Is Mandatory
Every behavior change MUST add or update automated tests at the lowest reliable level and MUST run
those tests after implementation. A bug fix MUST first have a regression test that fails for the
reported defect whenever technically feasible; after the fix, that test and the relevant existing
test suite MUST pass. New features MUST test acceptance criteria, authorization boundaries,
validation, error handling, and edge cases proportional to risk.

Verification MUST be automatic and repeatable. Frontend changes MUST run applicable tests, linting,
type checking, and production builds. Backend changes MUST run applicable tests, lint and formatting
checks, Django system checks, migration drift checks, and API schema validation. Changes that cross
application, module, API, database, or event boundaries MUST include integration or contract tests.
No change may be declared complete while required checks are failing, skipped without justification,
or known to be flaky.

### III. Scope Isolation and Regression Safety
Each change MUST have an explicit scope before code is modified. Implementations MUST make the
smallest coherent change that satisfies that scope and MUST preserve all unrelated behavior. Bug
fixes MUST address the root cause without changing unrelated features. New features MUST respect
existing product, module, route, data, and public-contract boundaries defined in `ARCHITECTURE.md`.
Unrelated refactoring, formatting churn, dependency upgrades, or behavioral changes MUST be split
into separate work.

Before completion, the implementer MUST identify affected callers, shared components, APIs, database
models, permissions, and user workflows. Tests MUST cover both the intended behavior and nearby
regression risks. Existing public contracts MUST remain backward compatible unless a breaking change
is explicitly specified, versioned, migrated, documented, and approved. This principle protects
stable features from accidental damage during development and maintenance.

### IV. Secure, Scalable, and Maintainable Architecture
All code and technical approaches MUST follow current, documented best practices appropriate to the
language, framework, and repository. Designs MUST favor clear contracts, modular ownership, typed
interfaces, dependency direction, simple composition, and removal of unnecessary duplication.
Complexity MUST be justified by a current requirement or measured constraint; speculative
abstractions and premature distributed architecture MUST NOT be introduced.

Every institute-owned operation MUST enforce tenant and role scope on the server. Sensitive data MUST
be minimized, protected in transit and at rest as appropriate, and excluded from source control and
unsafe logs. Performance-sensitive paths MUST use bounded queries, pagination for unbounded
collections, appropriate indexes, efficient network payloads, and controlled concurrency. Claims of
optimization MUST be supported by measurement, profiling, load expectations, or a clearly documented
complexity analysis. The design MUST permit horizontal growth without sacrificing correctness,
security, or product isolation.

### V. Usable, Accessible, and Observable Experiences
User-facing features MUST be easy to understand and complete without requiring users to know internal
IDs, implementation details, or undocumented procedures. Interfaces MUST provide clear labels,
validation feedback, loading progress, success confirmation, empty states, recoverable error states,
and responsive behavior. Keyboard access, focus handling, semantic structure, readable contrast, and
assistive-technology support MUST be included for applicable web experiences.

Operational behavior MUST be diagnosable without exposing secrets or personal data. Important
failures and state transitions MUST produce structured, actionable logs and stable error responses.
Health, readiness, metrics, traces, or audit events MUST be added when necessary to operate the
feature safely. Usability and observability are part of correctness, not optional polish.

All API errors MUST return a consistent, documented, machine-readable error contract containing an
appropriate HTTP status, stable error code, safe user-facing message, and request or correlation
identifier when useful. Validation failures MUST identify the affected fields and explain the
correction in plain language. Authentication, authorization, not-found, conflict, rate-limit,
dependency, timeout, and unexpected server errors MUST each have deliberate responses; raw stack
traces, database errors, framework internals, and secrets MUST never reach users. The UI MUST map
these responses to friendly, specific, actionable messages, preserve recoverable user input, show
field-level errors where applicable, and provide a clear next action. Unknown failures MUST still
receive a safe fallback message and a support or retry path.

## Engineering Standards

- Code MUST be readable, cohesive, documented where intent is not obvious, and consistent with the
  conventions of its owning application or backend module.
- Inputs MUST be validated at trust boundaries. Authentication and authorization MUST be enforced
  server-side for every protected operation, including tenant and branch scope where applicable.
- APIs, events, and shared schemas MUST be typed, version-aware, and tested as contracts. Consumers
  MUST NOT depend on another module's private models, repositories, or implementation details.
- Database changes MUST include reviewed migrations, constraints that protect invariants, safe
  defaults or backfills, and a compatibility plan for deployments involving mixed versions.
- External calls and background tasks MUST define timeouts, retry and idempotency behavior, failure
  handling, and safe limits. Retries MUST NOT duplicate irreversible operations.
- Unbounded work, queries, payloads, loops, and in-memory collections are prohibited on production
  paths. Resource usage MUST have explicit limits appropriate to expected scale.
- Dependencies MUST have a clear need, maintained provenance, compatible licensing, and acceptable
  security and performance characteristics. Existing platform capabilities SHOULD be preferred when
  they meet the requirement.
- Secrets, credentials, private keys, production data, and personal data MUST NOT be committed,
  embedded in fixtures, exposed to clients, or written to logs.
- Error responses MUST be consistent across endpoints and applications. Every new error path MUST
  define its status, stable code, safe message, remediation guidance, and logging behavior, then
  test both the API contract and the UI presentation when a UI consumes it.

## Delivery Workflow and Quality Gates

1. Define the requested behavior, acceptance criteria, constraints, and exact scope before editing
   code. Record architectural decisions when they affect boundaries or long-term maintenance.
2. Inspect the existing implementation, tests, contracts, and callers. Preserve unrelated user and
   system behavior and avoid changing files outside the established scope.
3. Add or update tests alongside the implementation. For a bug, reproduce the defect with a focused
   regression test before fixing it whenever technically feasible.
4. Implement the smallest production-ready solution. Handle validation, authorization, errors,
   accessibility, observability, migrations, and compatibility as part of the same change.
5. Run focused tests immediately after the change, then run all relevant regression and quality
   checks for every affected application or service. Error paths MUST be tested for both the API
   response and the user-visible UI message. Test failures MUST be fixed, not ignored.
6. For frontend changes, applicable gates include unit or integration tests, lint, type checking,
   production build, and realistic browser verification of changed workflows and responsive states.
7. For backend changes, applicable gates include `pytest`, Ruff lint and format checks, Django system
   checks, migration drift checks, schema validation, and contract or integration tests.
8. Verify that existing adjacent features still work. Cross-boundary changes MUST test both producer
   and consumer behavior, permissions, failure handling, and backward compatibility.
9. Report exactly what was changed, what was tested, and any remaining risk. If a required check
   cannot run, the work MUST remain incomplete unless the reason, risk, and follow-up are explicitly
   documented and accepted.

## Governance

This constitution is the highest-priority engineering policy for CampusOne. Specifications, plans,
tasks, code reviews, and implementation decisions MUST demonstrate compliance with it. Where another
project document conflicts with this constitution, the constitution governs unless it is formally
amended.

Amendments MUST be proposed as an explicit documentation change with the rationale, affected
principles, migration impact, and required updates to dependent practices. Approval is required from
the project owner or designated maintainers. Constitution versions follow semantic versioning: MAJOR
for incompatible governance changes, MINOR for new or materially expanded rules, and PATCH for
clarifications that do not change obligations.

Every feature and bug-fix review MUST verify scope isolation, production readiness, automated test
evidence, security and tenant safety, usability, and regression coverage. Exceptions MUST be written,
risk-assessed, approved, narrowly scoped, assigned an owner, and given an expiry or remediation date.
Repeated exceptions MUST trigger a design or process correction rather than becoming normal practice.

**Version**: 1.1.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-08-20
