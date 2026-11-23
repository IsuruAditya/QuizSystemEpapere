# e-Paperé Exams — Requirements

Source brief: `docs/brief/ePapere-Kiro-Master-Prompt.md` (MVP-first revision, 20 Nov 2026). This file restates the brief as numbered, testable requirements. The brief remains authoritative where wording differs.

Labels: **MVP** = implement now. **POST** = Post-MVP, documented in `docs/roadmap.md`, not implemented. **FUT** = future SMS integration, documented in `docs/future-student-system-integration.md`, not implemented.

## 0. Contradictions and resolutions (decisions)

| # | Tension in brief | Resolution |
|---|---|---|
| C1 | §3 names shadcn/ui; §3.1/§23.6 discourage unneeded dependencies. | Use Tailwind + a small in-repo component set following shadcn conventions, built on native accessible elements (`<button>`, `<input type=radio>`, `<dialog>`). No Radix runtime. ADR-008. |
| C2 | §3/§17 "large exports as resumable jobs" vs YAGNI; MVP export is one exam (≤ ~5–10k rows). | Synchronous streamed CSV with keyset pagination and hard row cap. Job-based export is POST if measured need. ADR-007. |
| C3 | Shared rate limiter required, Redis only "when justified", per-process memory forbidden. Better Auth limiter is IP-keyed only (breaks shared school networks). | Postgres-backed fixed-window counters keyed per account and (generously) per IP. No Redis. ADR-001. |
| C4 | Better Auth requires a unique `email`; brief forbids mandatory student email. | Store a synthetic non-routable address `<user-id>@accounts.invalid` (RFC 2606); never shown, never mailed. Login uses the EP ID (username plugin). ADR-001. |
| C5 | §12 synchronous grading vs "failed grading has nullable score". | Grading runs in the submit transaction. DB errors roll back (client retries; acknowledged answers persist). A non-DB grading fault commits the submission as `SUBMITTED` with `score NULL` plus a `GRADE_ATTEMPT` job in the same transaction. ADR-005. |
| C6 | Account removal/pseudonymisation vs immutable assessment history. | Removal pseudonymises the profile (name→"Removed student", contact/school cleared, login disabled); attempts are retained under the stable internal ID. Documented in ops guide. |
| C7 | §14 "leaderboard visibility" vs §9 "practice has no official leaderboard". | Leaderboards exist only for RANKED exams; visibility setting = students / hidden. |
| C8 | §23.3 extra-time accommodations ("if implemented") vs MVP table (not listed). | Not implemented in MVP (POST). Untimed practice is implemented. Accommodation policy is an open owner decision recorded in the accessibility report. |
| C9 | Expiry reconciliation needs a frequent scheduler; Vercel Hobby cron runs at most daily. | Lazy finalisation on every read/mutation of an expired attempt + `/api/internal/jobs/run` callable by Vercel Cron (Pro, every minute) or any external scheduler. Runtime deadline checks never depend on the job. External blocker recorded. |
| C10 | §23.2 privileged MFA "where practical". | MVP: password re-confirmation for sensitive admin operations + short admin session lifetime. TOTP MFA is a recorded residual-risk gap (POST, Better Auth `twoFactor` plugin is the planned path). |
| C11 | §15 lists "attempt assignments"; randomisation is POST. | Assigned order = immutable exam-version slot order and fixed option positions; no per-attempt order table until randomisation is built. Reproducibility is guaranteed by immutability. ADR-002. |
| C12 | Role changes must invalidate sessions, but MVP has no teacher role. | Roles: ADMIN, STUDENT. Additional admins are created only by the privileged CLI; no web role-change endpoint exists (tested negatively). |
| C13 | Raw CSV must stay private; storage of source files. | Raw bytes are not persisted; the import job stores SHA-256, size, filename and parsed rows in the private DB. Nothing goes to `public/`. |
| C14 | Brief specifies brand #3E3A98 (blue-violet); owner later asked for a professional teal theme. | Owner request wins: teal tokens (light #0F766E/#115E59, dark #2DD4BF) replace #3E3A98; contrast re-verified by axe in both themes. |

## 1. Scope (MVP)

- **R1.1 MVP** One institute's standalone exams/quizzes app; no SMS, payments, enrollment, multi-tenancy.
- **R1.2 MVP** Grades (6–11), subjects (Mathematics, Science, Sinhala, ICT), teachers stored as editable data.
- **R1.3 MVP** Single-answer MCQ with exactly four options; configurable count/duration; defaults 20 questions / 60 min on creation only.
- **R1.4 MVP** Sinhala/English text, KaTeX math, raster diagrams, optional explanations.

## 2. Accounts, auth, privacy (§4, §23.2)

- **R2.1 MVP** Roles ADMIN and STUDENT; server-side role checks on every privileged endpoint.
- **R2.2 MVP** Admin-created student accounts with unique `EP`-prefixed IDs (`^EP[0-9A-Z]{3,15}$`, case-insensitive) and passwords. No self sign-up, email, OTP or self-service recovery.
- **R2.3 MVP** Profile: EP ID, full name, display name/alias, grade, WhatsApp number (student's or guardian's; normalised to E.164, Sri Lankan formats accepted, not unique), optional school/district.
- **R2.4 MVP** Admin create/edit, disable/enable; disabled users cannot sign in or start attempts; their sessions are revoked. An in-progress attempt of a disabled user is not extended; it is finalised by expiry with saved answers (documented).
- **R2.5 MVP** Admin-assisted password reset: random temporary password shown once, hashed, `mustChangePassword=true`, all sessions revoked, audited.
- **R2.6 MVP** Users with `mustChangePassword` can only reach the change-password flow.
- **R2.7 MVP** Bulk student CSV registration with its own template, validation report and one-time credential download; separate from question import.
- **R2.8 MVP** HttpOnly, SameSite=Lax, Secure (production) session cookies; database sessions with expiry (12 h for all roles, refreshed hourly; a shorter admin lifetime is a recorded gap — see docs/security.md); logout revokes.
- **R2.9 MVP** Origin/Sec-Fetch-Site check on every cookie-authenticated mutation.
- **R2.10 MVP** Password hashing via Better Auth default scrypt (N=16384, r=16, p=1, 64-byte key) — documented.
- **R2.11 MVP** Login throttling per account (failures) and coarse per-IP ceiling sized for shared networks; stored in Postgres.
- **R2.12 MVP** First admin via one-time CLI (`npm run admin:bootstrap`), refuses when an admin exists; no default credentials or setup route.
- **R2.13 MVP** Password re-confirmation for: admin password reset of a user, void, grading correction.
- **R2.14 MVP** Never log passwords, hashes, cookies, answer keys; logs carry user IDs, not phone numbers.
- **R2.15 MVP** Leaderboards are authenticated and show rank, display name, marks, time only.
- **R2.16 POST** Teacher accounts/delegation, admin TOTP MFA.

## 3. Catalog and authoring (§5, §6, §7)

- **R3.1 MVP** Exam list: paginated, searchable, grade/subject/status filters; create, duplicate, preview, publish, archive.
- **R3.2 MVP** Exam editor fields: title, description, instructions, teacher, grade, subject, cover image, mode, duration (or untimed for practice), opens/closes (UTC stored, Asia/Colombo displayed), late start allowed, practice max attempts, score/correctness/correct-answer/explanation visibility, review release time, leaderboard visibility. Shows the grade eligibility rule.
- **R3.3 MVP** Validation: duration 1–600 min; opens < closes; RANKED requires closesAt and a finite duration.
- **R3.4 MVP** Lifecycle DRAFT → PUBLISHED → ARCHIVED; availability (UPCOMING/OPEN/CLOSED) derived at request time from timestamps.
- **R3.5 MVP** Publishing creates an immutable exam version (question-version slots, marks, initial grading revision). Content cannot change after publication; unpublish allowed only with zero attempts. Different paper ⇒ duplicate into a new exam.
- **R3.6 MVP** Question bank: create/edit questions (stem, four options, correct option, marks, explanation, topic, difficulty, images with alt text); every edit creates a new question version; used versions are immutable; reuse existing questions in an exam draft.
- **R3.7 MVP** One shared validation service for manual and CSV question input.
- **R3.8 MVP** CSV template + Sinhala/English example downloads; columns per §6; documented defaults for optional columns.
- **R3.9 MVP** Real CSV parser (BOM, quotes, embedded newlines, CRLF/LF, UTF-8); reject invalid UTF-8.
- **R3.10 MVP** Row/column errors for: header mismatch, missing required cells, bad type, duplicate external_id, empty option, bad correct_option (A–D after trim/upper only), non-positive/non-integer marks, limits (rows, text length, file size), unknown/not-owned media refs, image-only content without alt text. Warnings for identical options.
- **R3.11 MVP** Workflow upload → validate → stage → preview/edit rows → revalidate → commit to a draft exam. Invalid rows never disappear; commit blocked while errors exist; commit is transactional and idempotent (retry returns same result, no duplicates); a published exam is never modified by import.
- **R3.12 MVP** Import job records ID, actor, filename, SHA-256, size, destination exam, status, report.
- **R3.13 MVP** Image uploads: PNG/JPEG/WebP by magic bytes, ≤ 2 MB, ≤ 4096×4096, server-generated IDs; SVG/HTML/other rejected; no URL fetching.
- **R3.14 MVP** Media access: teacher photo/cover public once attached to a published exam; question images only to admins or students holding an attempt on an exam version containing them; `Cache-Control: private` for protected media.
- **R3.15 MVP** KaTeX rendering with `trust:false`, no HTML in imported text (rendered as text).
- **R3.16 POST** XLSX/QTI import, advanced taxonomy/search, revision comparison, randomisation.

## 4. Eligibility and student experience (§8, §8.1)

- **R4.1 MVP** One eligibility service: enabled STUDENT whose grade equals the exam grade, exam PUBLISHED and OPEN (and attempt policy permits).
- **R4.2 MVP** Routes: `/login`, `/student`, `/exams/[slug]`, `/attempts/[id]`, `/attempts/[id]/result`, `/exams/[slug]/leaderboard`, `/admin/...`. Safe same-origin return URL.
- **R4.3 MVP** Landing shows duration, marks, question count, attempt policy, timing/late-start warning, review policy, teacher photo; no question content before start.
- **R4.4 MVP** Attempt UI: large radio options, navigation grid, answered/unanswered counts, flag for review, progress, countdown (hidden when untimed), Saved/Saving/Pending/Offline/Retry status, submission review with unanswered list.
- **R4.5 MVP** Sinhala default, English toggle; dictionaries; `lang` attributes; light/dark themes; teal brand tokens (#0F766E/#FFFFFF light, #2DD4BF dark; C14).
- **R4.6 MVP** States: loading, empty, validation error, permission denied, offline/reconnecting, deadline reached, completed; no dead buttons.
- **R4.7 MVP** WCAG 2.2 AA target: keyboard flow, visible focus, labelled errors, contrast in both themes, targets ≥ 44px for answer options, reduced motion, accessible status announcements (no per-second announcements).

## 5. Attempts, timing, saving (§9–§11)

- **R5.1 MVP** Modes RANKED (one official attempt) and PRACTICE (max attempts configurable, null = unlimited; timed or untimed).
- **R5.2 MVP** DB-enforced: ≤ 1 non-void OFFICIAL attempt per (exam, student); ≤ 1 IN_PROGRESS attempt per (exam, student); concurrent starts return the same attempt.
- **R5.3 MVP** Void with reason (+ optional single replacement grant); originals retained and audited; replacement links `replaces_attempt_id` (unique).
- **R5.4 MVP** `deadline = min(started_at + duration, closes_at)`; untimed practice: `deadline = closes_at` or NULL. Server assigns start/deadline; responses include server time.
- **R5.5 MVP** New attempts rejected when NOT_OPEN/CLOSED; late start allowed only if configured, with explicit warning showing remaining time.
- **R5.6 MVP** Admission rule: a save/submit is admitted iff, while holding the attempt row lock, `clock_timestamp() < deadline_at`. No client time is trusted.
- **R5.7 MVP** Saves: batch of `{examQuestionId, optionId|null}`, `mutationId`, `baseRevision`, `controllerToken`; atomic compare-and-swap on attempt revision; duplicate mutation returns the original ack; stale revision → REVISION_CONFLICT with canonical state.
- **R5.8 MVP** Answer membership enforced by composite foreign keys (attempt↔exam version↔slot↔question version↔option).
- **R5.9 MVP** Writable controller: one controller token per attempt; another tab/device gets read-only until explicit takeover, which rotates the token (old controller's writes fail with CONTROLLER_CHANGED).
- **R5.10 MVP** Client: 800 ms debounce, 4 s max wait, one in-flight batch, exponential backoff with jitter, honours Retry-After, local pending store keyed by user+attempt, cleared on logout/finalisation/account switch.
- **R5.11 MVP** Refresh/re-login resumes the same attempt with deadline and saved selections.

## 6. Grading, finalisation, expiry (§10, §12)

- **R6.1 MVP** Server-only keys; student DTOs never contain correct option, correctness, or explanation before release.
- **R6.2 MVP** Score = Σ marks of correctly answered slots; max = Σ slot marks of the version; percentage = score/max (stored as basis points); unanswered/incorrect = 0; no negative marking.
- **R6.3 MVP** Submit transaction: lock attempt; finalised → return canonical receipt; capture receipt time; apply final snapshot if before deadline and revision matches; grade; persist status, score, max, elapsed, reason, grading revision; commit before ack.
- **R6.4 MVP** Receipt at/after deadline ⇒ finalised as EXPIRED with saved answers; elapsed = deadline − started.
- **R6.5 MVP** Manual elapsed_ms = receipt − started (bounded by deadline); preserved across retries/regrades.
- **R6.6 MVP** Expiry reconciliation (job + lazy) finalises expired IN_PROGRESS attempts using acknowledged answers only; uses SKIP LOCKED batches.
- **R6.7 MVP** Score NULL with explicit status for not-yet-graded/failed grading; never a fake 0/1.

## 7. Rankings (§13)

- **R7.1 MVP** Per exam only; eligible = OFFICIAL, GRADED, not void, on the version's latest grading revision.
- **R7.2 MVP** Order `score DESC, elapsed_ms ASC`; standard competition rank (1,2,2,4); `id` only stabilises pagination.
- **R7.3 MVP** Paginated SQL window query using a partial index; own rank shown regardless of page.
- **R7.4 MVP** Status PROVISIONAL until: close passed, no IN_PROGRESS/SUBMITTED-ungraded official attempts, no pending grading/regrade jobs, all results on latest grading revision; then FINAL. `ranking_revision` increments on void/regrade after FINAL, with visible notice.
- **R7.5 MVP** Time displayed with tenths of a second; detail shows milliseconds.

## 8. Review and regrading (§14)

- **R8.1 MVP** Independent visibility for score, correctness, correct answer, explanation (IMMEDIATE / AFTER_RELEASE / NEVER), enforced server-side on every review endpoint; release time defaults to closes_at.
- **R8.2 MVP** Defaults: PRACTICE all IMMEDIATE; RANKED score IMMEDIATE, others AFTER_RELEASE.
- **R8.3 MVP** Grading correction: new grading revision with reason + password confirmation; original key/content retained; bounded idempotent regrade job; times unchanged; leaderboard uses only latest revision and is PROVISIONAL until complete.

## 9. Administration (§5)

- **R9.1 MVP** Overview: exams by availability, attempt/submission counts per exam (computed on request, not polled), failed import/job list.
- **R9.2 MVP** Attempts list per exam: status, last acknowledged save time, revision, finalise reason, score, audit events.
- **R9.3 MVP** Results: statistics (count, mean, max, min), leaderboard, result detail, CSV export with formula-injection neutralisation, void/replacement, grading correction.
- **R9.4 MVP** Settings: grades, subjects, teachers (photo), branding name; no secrets.
- **R9.5 MVP** Audit events for admin actions, publication, access changes, voids, corrections, password resets.

## 10. API and errors (§16, §23.4)

- **R10.1 MVP** Versioned JSON API under `/api/v1`, Zod-validated, OpenAPI 3.1 document (`docs/openapi.yaml`).
- **R10.2 MVP** RFC 9457 problem details with `code` and `requestId`; stable codes: NOT_OPEN, CLOSED, ACCESS_DENIED, UNAUTHENTICATED, NOT_FOUND, ATTEMPT_FINALIZED, REVISION_CONFLICT, CONTROLLER_CHANGED, INVALID_OPTION, VALIDATION_ERROR, RATE_LIMITED, TEMPORARY_FAILURE, NO_ATTEMPTS_REMAINING, PASSWORD_CHANGE_REQUIRED, CONFLICT.
- **R10.3 MVP** `Cache-Control: no-store` on personalised responses; request size limits; `X-Request-Id`.
- **R10.4 MVP** Internal job endpoint authenticated with `CRON_SECRET` bearer; bounded batches; leases.

## 11. Operations and quality (§17, §18, §23)

- **R11.1 MVP** Environment validation at startup; `.env.example`; separate DBs per environment; preview must not use production DB (guard by `APP_ENV`).
- **R11.2 MVP** Migrations including raw SQL for partial/check/composite constraints; tested from empty DB.
- **R11.3 MVP** Durable job table with lease, retries, backoff, max attempts, terminal FAILED visible to admins.
- **R11.4 MVP** Structured JSON logs with request IDs; redaction.
- **R11.5 MVP** Security headers (CSP, frame-ancestors none, nosniff, referrer-policy, HSTS in production).
- **R11.6 MVP** CI workflow: install (frozen lockfile), lint, typecheck, unit, Postgres integration, build, E2E, audit, secret scan.
- **R11.7 MVP** k6 scenarios for all §18 workloads; run status reported honestly (NOT RUN without infrastructure).
- **R11.8 MVP** Docs: README, ER diagram, API contracts, timing/concurrency policy, scoring/ranking policy, deployment, admin guide, operations guide, threat model, accessibility report, engineering-standards mapping, ADRs, test report, load report, status report, roadmap, integration note.
- **R11.9 POST** OpenTelemetry traces exporter, alert wiring to a paging provider (instrumentation points + log-based metrics documented now).

## 12. Future integration boundaries (§24) — implemented as boundaries only

- **R12.1 MVP** Stable internal user IDs (cuid) independent of EP login ID; attempts reference internal IDs.
- **R12.2 MVP** Identity resolution in `server/auth`; services accept an explicit `Actor`.
- **R12.3 MVP** Eligibility in one service (`server/exams/eligibility.ts`).
- **R12.4 FUT** OIDC shared sign-in, account linking, SMS result APIs/webhooks — documentation only.

## 13. Required tests (§19) → see traceability matrix in `docs/traceability.md`.
