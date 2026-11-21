# Architecture decision records

Short records: decision, alternatives considered, consequences. Status: accepted unless noted.

## ADR-001 Authentication, sessions and throttling
- **Decision:** Better Auth 1.7 with the username plugin and database sessions, called only via `auth.api.*` from our route handlers (no catch-all auth route). Public sign-up is disabled; accounts are created by admins or the CLI. Passwords use Better Auth's default scrypt (N=16384, r=16, p=1, 64-byte key, 16-byte random salt, NFKC). Better Auth requires a unique email, so we store a synthetic `<uuid>@accounts.invalid` (RFC 2606) that is never shown or mailed. Throttling uses our own PostgreSQL fixed-window counters: 10 failures per account per 15 min, and 600 attempts per IP per 10 min (sized for shared school networks). Better Auth's IP-only limiter is disabled.
- **Alternatives:** Auth.js credentials (discouraged by its docs for this use); a hand-written session table (rejected: custom session protocol, §23.2); Redis rate limiting (no measured need; adds a service).
- **Consequences:** No email, OTP or self-service recovery (admin-assisted reset only). Admin MFA is a recorded gap (Post-MVP: Better Auth `twoFactor`). Sessions cannot be cookie-cached, so revocation takes effect on the next request at the cost of one DB read per request.

## ADR-002 Data model and versioning
- **Decision:** Question bank uses `question` → immutable `question_version` → 4 `question_option` rows with stable UUIDs. Publishing freezes draft items into `exam_version` + `exam_question` slots + `grading_revision` #1 with `grading_key` rows. Attempts pin `exam_version_id`. Membership is proven by composite foreign keys. The assigned order is the immutable slot order and fixed option positions (randomisation is Post-MVP, so no per-attempt order table).
- **Alternatives:** JSON snapshot per attempt (weaker constraints); mutable questions with audit (breaks reproducibility).
- **Consequences:** Edits create new versions; drafts follow the new version and published exams never change. Adding randomisation later needs an `attempt_slot_order` table and a migration.

## ADR-003 Server time, deadline and admission
- **Decision:** PostgreSQL `clock_timestamp()` read after the attempt row lock is the only clock. `deadline = LEAST(start + duration, closes_at)`; it is NULL only for untimed practice without a close time. A mutation is admitted iff `now < deadline`, with no grace window. Manual elapsed = receipt − start (bounded); expiry elapsed = deadline − start. All sessions run in UTC (DB default via migration).
- **Alternatives:** App-server clock (skew across instances); a grace window (gives extra answer time).
- **Consequences:** Network delay near the deadline can cause a late click to be rejected; students are told saved answers are submitted. A verified adapter defect (non-UTC session shifts `timestamptz`) is prevented by the migration plus a regression test.

## ADR-004 Concurrent saves and multiple tabs
- **Decision:** Attempt-level revision compare-and-swap under the row lock, with `mutationId` dedupe (last mutation). The client keeps one batch in flight and retries the same batch with the same `mutationId`. A single `controller_token` per attempt: explicit takeover rotates it and other tabs and devices become read-only.
- **Alternatives:** Per-answer timestamps (client clock trust); a heartbeat lease for tab ownership (constant DB writes); BroadcastChannel only (not cross-device).
- **Consequences:** No heartbeat writes. A takeover from another device is always explicit. Conflicts return the canonical answers, and the UI keeps the student's selections and re-queues them.

## ADR-005 Grading inside the submit transaction
- **Decision:** Pure `gradeAttempt()` runs in the same short transaction as finalisation. The attempt row lock serialises submit, save and expiry. DB errors roll back; a key-data fault commits SUBMITTED with a NULL score plus a `GRADE_ATTEMPT` job (same transaction = outbox). Grade history goes to `attempt_grade` (unique per revision).
- **Alternatives:** Asynchronous grading queue (unneeded for 20–40 MCQs; adds latency and moving parts).
- **Consequences:** Submit latency includes grading (one indexed read of ≤ 500 keys). There are never fake 0 or 1 scores.

## ADR-006 Per-exam ranking
- **Decision:** SQL `RANK() OVER (ORDER BY score DESC, elapsed_ms ASC)` over one exam's eligible rows (OFFICIAL, GRADED, not void, latest grading revision), paginated. Own rank = 1 + count strictly better (partial index `attempt_ranking`). Status is FINAL only after close, no in-progress or ungraded official attempts, and no stale revisions. No cache, because measured cost is about 11 ms for 5,000 rows (docs/architecture.md).
- **Alternatives:** Materialised leaderboard table (invalidation complexity); a per-submission counter (contended row).
- **Consequences:** Cost grows linearly with one exam's participants. Revisit with a bounded cache if staging shows leaderboard p95 above target at 5,000.

## ADR-007 Jobs and scheduling
- **Decision:** A durable `job` table with dedupe keys, leases (120 s), exponential backoff, max attempts and a visible FAILED state. The dispatcher `/api/internal/jobs/run` is authenticated by `Bearer CRON_SECRET`, bounded to 20 s, and also runs expiry reconciliation. Vercel Cron calls it every minute (Pro plan); GET is accepted because Vercel Cron uses GET. Results CSV export is synchronous and streamed in keyset pages with a 20,000-row cap.
- **Alternatives:** Managed queue (no current need); a job-based export (one exam is small).
- **Consequences:** Hobby-plan cron (daily) is insufficient. Runtime deadline checks and lazy finalisation keep correctness when jobs are delayed, but leaderboards stay PROVISIONAL until reconciliation runs.

## ADR-008 UI components and rendering
- **Decision:** Tailwind and a small in-repo component set on native elements (radio inputs, `<dialog>`, `<fieldset>`), following shadcn conventions without the Radix runtime. KaTeX renders math with `trust:false` and no macros; all other text is React text. Answer radios are native inputs stretched transparently over the option card (full-size target, native keyboard and AT behaviour). `ClientForm` uses `method="post"` and disables its controls until hydration.
- **Alternatives:** shadcn/ui + Radix (more dependencies for no current need).
- **Consequences:** Accessibility rests on native semantics plus axe checks. More complex widgets would need a vetted library.
