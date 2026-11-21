# e-Paperé Exams — Implementation Tasks (MVP only)

Dependency-ordered. Status: [x] done and verified by an executed test or check, [~] implemented but not fully verified, [ ] not done. Evidence: `docs/test-report.md`, `docs/traceability.md`.

## Stage 1 — Review and specification
- [x] 1.1 Inspect repository (empty), select stable versions, record in README
- [x] 1.2 requirements.md, design.md, tasks.md, steering, contradiction log
- [x] 1.3 ADRs (docs/adr.md), traceability matrix (docs/traceability.md)

## Stage 2 — Foundation
- [x] 2.1 Next.js/TS strict/Tailwind/ESLint/Vitest/Playwright config; env validation at startup
- [x] 2.2 Prisma schema + migrations incl. raw SQL constraints/indexes; UTC migration; migrate from empty DB
- [x] 2.3 Better Auth (username, DB sessions), login/logout/password routes, throttle, origin check, `withRoute` + problem details
- [x] 2.4 Admin bootstrap CLI; non-production seed (2 labelled demo exams, demo students)
- [x] 2.5 Audit, job table/runner, rate limit, logging, security headers

## Stage 3 — Authoring
- [x] 3.1 Catalog settings (grades, subjects, teachers, branding)
- [x] 3.2 Shared question validation; question bank with versions
- [x] 3.3 Exam CRUD, duplicate, draft items, publish/unpublish/archive
- [x] 3.4 Media upload/validation/storage adapters; authorised delivery
- [x] 3.5 CSV import: parse, report, edit, revalidate, idempotent commit; templates
- [x] 3.6 Students: create/edit/disable/reset/pseudonymise; bulk CSV

## Stage 4 — Taking exams
- [x] 4.1 Eligibility service; dashboard; landing page
- [x] 4.2 Start/resume, attempt DTO (no keys), takeover
- [x] 4.3 Save CAS endpoint; client sync queue; local recovery; attempt UI

## Stage 5 — Grading and ranking
- [x] 5.1 Pure grading; transactional submit; receipts
- [x] 5.2 Expiry reconciliation (job + lazy)
- [x] 5.3 Release policy + review page
- [x] 5.4 Per-exam leaderboard, status, own rank; query plans

## Stage 6 — Results administration
- [x] 6.1 Overview, attempts list, statistics, CSV export
- [x] 6.2 Void/replacement; grading correction + regrade job

## Stage 7 — Verification
- [x] 7.1 Unit tests (44)
- [x] 7.2 PostgreSQL integration tests (60), incl. HTTP-level security tests
- [~] 7.3 Playwright E2E + axe (7 pass on Chromium); manual AT, Safari/Firefox, admin-page axe pending
- [x] 7.4 lint, typecheck, build, audit; test report

## Stage 8 — Handoff
- [~] 8.1 k6 scenarios + integrity check; local smoke only — staging capacity NOT RUN
- [~] 8.2 CI workflow (not yet run on GitHub); deployment, admin, operations, security, accessibility, standards, roadmap, integration, status docs written
- [ ] 8.3 Staging deployment, restore drill, pilot (requires owner authorisation and credentials)
