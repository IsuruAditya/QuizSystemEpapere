# Implementation Plan: e-Paperé Exams (MVP)

## Overview

MVP implementation tasks, in dependency order. `[x]` = done and verified by an executed test or check; `[ ]` = not done or not yet verified. Partly verified tasks are split into done and pending sub-tasks. Evidence: `docs/test-report.md`, `docs/traceability.md`. Requirements: `requirements.md`; design: `design.md`.

## Tasks

- [x] 1. Review and specification
  - [x] 1.1 Inspect repository (empty), select stable versions, record in README
  - [x] 1.2 requirements.md, design.md, tasks.md, steering, contradiction log
  - [x] 1.3 ADRs (docs/adr.md), traceability matrix (docs/traceability.md)

- [x] 2. Foundation
  - [x] 2.1 Next.js/TS strict/Tailwind/ESLint/Vitest/Playwright config; env validation at startup
  - [x] 2.2 Prisma schema + migrations incl. raw SQL constraints/indexes; UTC migration; migrate from empty DB
  - [x] 2.3 Better Auth (username, DB sessions), login/logout/password routes, throttle, origin check, `withRoute` + problem details
  - [x] 2.4 Admin bootstrap CLI; non-production seed (2 labelled demo exams, demo students)
  - [x] 2.5 Audit, job table/runner, rate limit, logging, security headers

- [x] 3. Authoring
  - [x] 3.1 Catalog settings (grades, subjects, teachers, branding)
  - [x] 3.2 Shared question validation; question bank with versions
  - [x] 3.3 Exam CRUD, duplicate, draft items, publish/unpublish/archive
  - [x] 3.4 Media upload/validation/storage adapters; authorised delivery
  - [x] 3.5 CSV import: parse, report, edit, revalidate, idempotent commit; templates
  - [x] 3.6 Students: create/edit/disable/reset/pseudonymise; bulk CSV

- [x] 4. Taking exams
  - [x] 4.1 Eligibility service; dashboard; landing page
  - [x] 4.2 Start/resume, attempt DTO (no keys), takeover
  - [x] 4.3 Save CAS endpoint; client sync queue; local recovery; attempt UI

- [x] 5. Grading and ranking
  - [x] 5.1 Pure grading; transactional submit; receipts
  - [x] 5.2 Expiry reconciliation (job + lazy)
  - [x] 5.3 Release policy + review page
  - [x] 5.4 Per-exam leaderboard, status, own rank; query plans

- [x] 6. Results administration
  - [x] 6.1 Overview, attempts list, statistics, CSV export
  - [x] 6.2 Void/replacement; grading correction + regrade job

- [ ] 7. Verification
  - [x] 7.1 Unit tests (44)
  - [x] 7.2 PostgreSQL integration tests (60), incl. HTTP-level security tests
  - [ ] 7.3 End-to-end and accessibility
    - [x] 7.3.1 Playwright E2E + axe on Chromium, desktop and Pixel 5, light and dark (7 pass)
    - [ ] 7.3.2 Manual assistive-technology checks (screen readers)
    - [ ] 7.3.3 Safari and Firefox runs
    - [ ] 7.3.4 axe on admin pages
  - [x] 7.4 lint, typecheck, build, audit; test report

- [ ] 8. Handoff
  - [ ] 8.1 Load testing
    - [x] 8.1.1 k6 scenarios + integrity check (`load-verify.ts`); local smoke run
    - [ ] 8.1.2 Staging capacity run (NOT RUN; needs production-equivalent infrastructure)
  - [ ] 8.2 CI and documentation
    - [x] 8.2.1 CI workflow (`.github/workflows/ci.yml`) written and running on GitHub pushes
    - [ ] 8.2.2 Confirm a green CI run on the latest `main`
    - [x] 8.2.3 Docs: deployment, admin, operations, security, accessibility, standards, roadmap, integration, status
  - [ ] 8.3 Staging deployment, restore drill, pilot (requires owner authorisation and credentials)

## Task Dependency Graph

Waves run in order; tasks within a wave have no dependencies on each other.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 5, "tasks": ["6.1", "6.2"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3.1", "7.3.2", "7.3.3", "7.3.4", "7.4"] },
    { "id": 7, "tasks": ["8.1.1", "8.1.2", "8.2.1", "8.2.2", "8.2.3", "8.3"] }
  ]
}
```

## Notes

- Post-MVP items are tracked in `docs/roadmap.md`, not here.
- Load tests (`load/k6/*.js`) must never run against a live exam without explicit authorisation.
- Task 8.3 is blocked on the owner: staging credentials and authorisation are needed.
