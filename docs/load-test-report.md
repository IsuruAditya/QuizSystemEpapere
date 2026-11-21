# Load-test report

**Capacity status: NOT VERIFIED.** No production-equivalent infrastructure (Vercel and Neon) was available. The only runs so far are **smoke runs of the harness itself** against a production build on a developer laptop. They prove the scripts work and that the integrity invariants hold under small concurrency. They say **nothing** about 5,000 concurrent students.

## Harness

- `scripts/load-prepare.ts` creates distinct accounts `EPL00001…` (real scrypt hashes, no weakened cost) and a 20-question ranked exam. It refuses `APP_ENV=production`.
- `load/k6/scenarios.js` + `lib.js` define the scenarios required by §18. Each virtual user has its own account and attempt.

  | `SCENARIO` | Workload |
  |---|---|
  | `logins` | 5,000 logins / ~60 s |
  | `start_burst` | 5,000 starts / ~30 s, with 20 % duplicate starts |
  | `exam_session` | 5,000 students over 60 min: reading time, answer changes, reconnects, submit |
  | `save_envelope` | 333 saves/s for 10 min. This equals 5,000 clients saving every 15 s; it is a test envelope, not the autosave algorithm |
  | `submit_burst` | 5,000 submits / ~10 s, with duplicate clicks and result reads |
  | `expiry` | abandoned attempts, followed by reconciliation |
  | `reads` | leaderboard reads, plus one admin export during activity |

- Profiles: `PROFILE=smoke|normal|spike|soak|stress`, scaling to 0.2 %, 50 %, 100 %, 100 % (long) and 150 % of the target.
- Thresholds (objectives from §18): save p95 < 1 s, submit p95 < 2 s, `http_req_failed` < 0.1 %, zero unexpected 5xx, zero dropped iterations. The JSON summary is written to `load/results/`.
- `scripts/load-verify.ts` is the post-run integrity check: no duplicate official attempts, no invalid or fake scores, no answer at or after the deadline, no duplicate grade rows.

## Smoke runs executed (21 Nov 2026)

Environment: Windows laptop; `next start` (production build) and k6 v2.4.0 on the same machine; embedded PostgreSQL 18.7 on localhost; 20 load students; 1 Node process; `DATABASE_POOL_MAX=5`.

| Scenario | Requests | Failed | Checks | p95 (all requests) | Specific metric |
|---|---|---|---|---|---|
| logins (20) | 20 | 0 % | 20/20 | 1,149 ms | dominated by scrypt (≈ 50–60 ms CPU each) running on one machine at once |
| start_burst (20, + duplicates) | 47 | 0 % | 47/47 | 1,069 ms | includes logins |
| save_envelope (10 saves/s, 30 s) | 360 | 0 % | 340/340 | 143 ms | **save ack p95 54 ms** |
| reads (1/s, 5 min, 100 VUs on 20 accounts) | 401 | 0 % | 100/100 | 102 ms | leaderboard |
| submit_burst (20, + duplicates, fresh exam) | 106 | 0 % | 66/66 | — | **submit receipt p95 208 ms**, max 222 ms |

Integrity check after submit_burst: `{"total":20,"graded":20,"duplicateOfficialAttempts":0,"invalidGradedScores":0,"answersAtOrAfterDeadline":0,"duplicateGradeRows":0}`.

### Harness defects found and fixed during these runs

1. k6 clears cookies every iteration by default. Reused sessions in `save_envelope` got 401. Fixed with `noCookiesReset: true`, matching real browsers.
2. Reader VUs exceeding the account count signed in as non-existent users. Fixed with modulo account selection.
3. A first `submit_burst` run silently skipped submits because its attempts had already expired (60-minute exam), which the server correctly auto-finalised. It was re-run on a fresh exam. Lesson for staging: prepare a fresh exam per scenario run.

Not yet smoke-run: `exam_session` (60 min) and `expiry` with reconciliation.

## Required before claiming capacity (pending, needs authorisation and resources)

1. A staging environment that mirrors production: Vercel plan and region `sin1`, Neon compute size, pooled URL, `DATABASE_POOL_MAX`, private Blob, cron enabled.
2. A load generator **outside** the app host. 5,000 VUs need a k6 machine with enough CPU and network, or Grafana Cloud k6. Check `dropped_iterations` = 0 to confirm it really generated the load.
3. Run order on staging: smoke → normal (50 %) → spike (100 % starts and submits) → soak (60-min `exam_session` at 100 %) → stress (150 %). Run `load-verify.ts` after each run, and run the expiry scenario followed by the job runner, then confirm the leaderboard reaches FINAL.
4. Record: p50/p95/p99 per endpoint, error and timeout counts, retries, Neon CPU and connections, pooler wait, function concurrency and cold starts, and estimated cost per exam.
5. Failure drills: connection loss (client offline: E2E-verified locally), DB failover or restart during saves, function termination mid-submit (commit-then-lost-response is covered by tests locally), delayed cron.

**Known risk to measure first:** 5,000 logins in about 60 s means roughly 5,000 scrypt verifications at 16 MiB memory each. Serverless CPU and memory, plus the per-login rate-limit writes, may dominate this phase. Staggering the start time (for example sign-in opening 15 minutes before the exam) is an operational mitigation if the measurement shows a need. Do not lower the hashing cost.
