# Security Penetration Test Report

**Generated:** 2026-08-12 06:02:09 UTC

# Executive Summary

# Executive Summary

A white-box assessment of the **CampusOne** monorepo identified one confirmed security vulnerability in the calendar integration flow and several additional code-level candidates that could not be dynamically confirmed within this run because of local runtime/tooling friction.

**Overall risk posture:** Moderate.

**Confirmed finding**
- A validated weakness in the calendar OAuth callback allows callback completion to be authorized by possession of a live `state` value alone, without verifying that the caller is the same authenticated administrator who initiated the integration flow.

**Business impact**
- If a live calendar OAuth `state` value is exposed before use, an attacker can complete the callback from a different browser session, including an unauthenticated one, and bind attacker-controlled provider credentials to the victim institute’s calendar integration.
- The same flow also contains a race window because the `state` is marked consumed only after token exchange and connection update.

**Additional observations**
- Source review identified a high-confidence branch-scope authorization candidate affecting student/staff administration and an unresolved client-context spoofing candidate between `admin-web` and `platform-admin`, but neither was dynamically confirmed in this run.
- The invitation onboarding flow and frontend XSS paths received focused review and did not yield a confirmed reportable vulnerability.

The primary remediation theme is to strengthen server-side trust binding in sensitive multi-step flows, especially where tenant, user, or client context is inferred from mutable request state rather than enforced against the authenticated principal.

# Methodology

# Methodology

The assessment was conducted as a **white-box application security review** of the repository at `/workspace/CampusOne`, combining source-aware analysis with targeted dynamic validation where feasible.

**Frameworks and approach**
- **OWASP Web Security Testing Guide** aligned review of authentication, authorization, session handling, and business logic.
- **PTES-style** workflow for scoping, source-aware triage, targeted validation, and impact confirmation.

**Scope covered**
- React/Vite admin frontends under `apps/institute-admin-web` and `apps/platform-admin-web`.
- Django/DRF backend under `services/api`, with emphasis on identity, access control, people management, onboarding, and calendar integration.

**Activities performed**
- Repository mapping to identify application structure, frameworks, routing, auth flows, and run paths.
- Source-aware static triage using `semgrep`, structural AST-style review, `gitleaks`, targeted code tracing, and bounded artifact collection.
- Focused security analysis of high-value areas including:
  - identity and session workflows
  - branch and institute authorization boundaries
  - invitation-based onboarding
  - calendar OAuth/connect/sync flows
  - frontend XSS exposure paths and token storage impact
- Dynamic validation attempts against the strongest candidates where feasible.

**Constraints**
- Some local runtime and shell-output issues reduced dynamic coverage for selected candidates, most notably the branch-scope authorization path and deeper authentication/client-spoofing validation. Those items were not reported because proof-of-concept validation was not completed.

# Technical Analysis

# Technical Analysis

**Severity model** reflects validated exploitability and demonstrated impact rather than static code risk alone.

## Confirmed vulnerability

1. **OAuth callback state is not bound to the initiating user in calendar integration** (**Low**, reported as `vuln-0001`)
   - The calendar OAuth start flow records the initiating administrator in `CalendarOAuthState.user`, but the callback endpoint accepts any request with a live `state` value and provider `code`.
   - The callback does not verify `request.user`, `request.auth`, or a match between the callback caller and `CalendarOAuthState.user` before exchanging tokens and updating the institute/provider connection.
   - Because the callback persists the integration by `state.institute` and `state.provider`, knowledge of an in-flight `state` value is sufficient to finalize the binding in the victim institute context.
   - The `used_at` field is written only after token exchange, connection update, and sync, which leaves a replay/race window within the same root cause.

## Important non-reported candidates

2. **Branch-scope authorization weakness in student/staff administration** (**high-confidence static candidate, not validated**) 
   - Source review indicates `BRANCH_ADMIN` is admitted broadly by `IsCurrentInstituteAdmin`, while several student and staff detail/mutation handlers appear to scope records only by institute and not by the caller’s assigned branch.
   - Negative-control logic in `StudentBulkDeleteView` appears more restrictive, reinforcing a likely inconsistency.
   - This issue was not reported because local dynamic validation was impeded by runtime/tooling output failure.

3. **Client-context spoofing between `admin-web` and `platform-admin`** (**medium-confidence candidate, not validated**)
   - Identity/session review highlighted possible risk around request-controlled client/application context handling in the login, current-session, and refresh flows.
   - The auth validation chain did not complete a proof-of-concept in time, so no finding was filed.

## Ruled-out or non-reportable areas in this run

- **Invitation/password-setup flow:** reviewed and dynamically assessed without confirming replay, unauthorized setup, cross-tenant misuse, or meaningful enumeration.
- **Frontend XSS leading to localStorage session theft:** no reflected, stored, or DOM XSS primitive was confirmed in the reviewed admin frontend code paths.
- **Calendar SSRF or request-driven open redirect:** not confirmed in the reviewed provider integration path.

## Systemic themes

- **Trust binding gaps in multi-step workflows:** the confirmed OAuth issue demonstrates insufficient linkage between a sensitive follow-up request and the original authenticated initiator.
- **Complex tenant and role boundaries:** the codebase contains several institute-, branch-, and client-context decision points that increase the likelihood of authorization inconsistencies if not enforced centrally and uniformly.
- **Frontend restrictions may not equal backend enforcement:** source review suggests at least one area where client-side branch scoping may be stronger than corresponding backend object checks.

# Recommendations

# Recommendations

**Immediate**
1. Remediate the reported calendar OAuth callback weakness by requiring an authenticated callback, enforcing that the callback principal matches `CalendarOAuthState.user`, and consuming `state` atomically before provider token exchange.
2. Retest the full calendar connect flow after the fix to confirm that cross-session and unauthenticated callback completion are blocked and that concurrent reuse of the same `state` fails safely.

**Short-term**
3. Perform a focused remediation review of branch-scoped admin endpoints in student and staff management, especially where lookups are constrained by institute but not explicit branch ownership.
4. Centralize or reuse object-level authorization checks for branch-admin actions so branch restrictions are enforced server-side for read, update, delete, and create operations.
5. Re-run dynamic validation for identity/session client-context handling, specifically `sessions/current`, `sessions/refresh`, logout invalidation, and any `admin-web` versus `platform-admin` context switching logic.

**Medium-term**
6. Review all multi-step security-sensitive flows for proper binding between initiation and completion state, including OAuth, invitation, and onboarding workflows.
7. Reduce reliance on frontend-only gating for branch, role, or platform distinctions; enforce these decisions in backend policy and object selectors.
8. Consider reducing browser exposure of sensitive session artifacts stored in `localStorage`, especially for privileged admin interfaces, to limit the blast radius of any future client-side injection issue.

**Retest and validation**
9. Conduct a targeted retest after fixes, prioritizing:
   - calendar OAuth callback binding and race handling
   - branch-admin access to cross-branch student and staff resources
   - cross-client auth/session acceptance between institute admin and platform admin contexts.

