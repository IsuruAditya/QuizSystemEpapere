# Operations guide

Owner: the institute's technical lead (named before launch). Status: procedures written; **none rehearsed on staging yet**.

## Monitoring and alerts

Logs are structured JSON on stdout/stderr (Vercel log drains can forward them). Keys matching password/token/cookie/hash/whatsapp/phone/answer/correct are redacted. Every response carries `X-Request-Id`, and problem bodies include `requestId`.

| Signal | Source | Alert when | Runbook |
|---|---|---|---|
| Save failures | `/api/v1/attempts/*/answers` 5xx rate (Vercel observability) | > 0.5 % over 5 min during an exam | Check Neon CPU/connections; check the `transient database failure` logs. Students keep answers locally and retry automatically. |
| Submit failures | `/submit` 5xx rate | any sustained 5xx | Same as above. Submit is idempotent, so students may press again. |
| Save p95 latency | Vercel function duration | > 1 s | Neon compute or pool saturation; see the load-test report for the tested envelope |
| Unreconciled expiries | Admin Overview banner ("expired attempts not yet finalised for over 5 minutes") | non-zero | Job scheduler not running or failing (check its history for non-200 responses); invoke `POST /api/internal/jobs/run` manually with the secret |
| Failed jobs | Admin Overview "Needs attention" (`job.status = FAILED`) | any | Read `last_error`; fix the cause; re-queue by re-running the regrade (dedupe key re-queues) |
| DB saturation | Neon console: CPU, connections, waiting queries | CPU > 80 % sustained | Scale compute (pre-approved size for exam days) |

`logger.info("job runner", …)` is logged every minute with counts (expired finalised, jobs run/failed), so a missing minute means the scheduler stopped. OpenTelemetry export is Post-MVP. Log-based checks are the current mechanism.

## Incident response (during an exam)

1. **Do not** deploy schema or attempt-protocol changes during an open exam.
2. A database outage means saves and submits return 503 and students see "Saving failed – retrying". Answers stay on the device. The deadline is not extended automatically. If the outage was material, decide on a fair remedy: void with replacement for affected students, or duplicate the exam for a re-sit. Record the decision in the audit trail.
3. For a wrong answer key, use Results → "Correct an answer key". Do not edit data in SQL.
4. For a student locked out, use Students → reset password (shows a one-time password). Verify the student's identity by a known channel first.
5. Afterwards, write a short incident note: time window, request IDs, affected attempts, remedy.

## Backup and restore

- Neon provides point-in-time restore within the plan's history-retention window. Confirm the retention of the purchased plan (at least 7 days recommended) and record it here before launch.
- Before each exam day, create a named Neon branch snapshot (`pre-exam-YYYYMMDD`).
- **Restore drill (required before launch, NOT YET DONE):**
  1. Create a branch from a past point in time.
  2. Point a Preview deployment at it, never production.
  3. Run `npx prisma migrate status`.
  4. Open one exam's results and leaderboard and compare against the export taken at that time.
  5. Record the time taken and the outcome.
- Blob storage holds only images; keep the original teacher photos. Question images can be re-uploaded if lost (media IDs change, so question references would need updating).
- Browser recovery (local pending answers) is a convenience. It is not a backup.

## Release and rollback

1. CI must be green: lint, typecheck, unit, integration, build, E2E, audit.
2. Apply migrations to staging, run the E2E suite against staging, then apply to production outside exam windows.
3. Promote the deployment. Rollback means promoting the previous Vercel deployment, which is only safe if it is schema-compatible.
4. Smoke check: login, the student dashboard, start a practice exam, save, submit.

## Data retention and removal

- **Students:** "Remove personal data" pseudonymises the profile (name, contact, school, district) and disables login. Attempts and results are kept under the internal ID so leaderboards and audits stay consistent.
- **Audit events:** keep for 2 years (policy proposal; owner to confirm). There is no automatic purge in the MVP.
- **Sessions** expire 12 hours after last refresh (all roles). Rate-limit buckets older than 24 hours are purged by the job runner.
- **Exports** contain personal data. Store them in the institute's controlled drive only and delete them when they are no longer needed.

## Exam-day readiness checklist

- [ ] Exam published, preview checked, share link tested by a staff student account
- [ ] `closesAt`, duration and review release time correct in Asia/Colombo
- [ ] Neon compute at the approved exam size; scale-to-zero off; pre-exam branch created
- [ ] Scheduler runs visible in the last 10 minutes (one 200 per minute); Admin Overview shows no failed jobs
- [ ] Support contact and a reset-password operator available during the exam

## Launch checklist (before inviting students)

1. Provision paid capacity (Vercel Pro, Neon compute sized by the load test, private Blob). **Requires owner authorisation.**
2. Configure secrets in Vercel (never in chat or source).
3. Run migrations; bootstrap the admin; change the temporary password.
4. Upload real branding and teacher photos (no placeholders).
5. Import and validate a real paper; have a teacher check the preview and the answer key.
6. Run a pilot with a small group (e.g. 30–100 students) and review the logs.
7. Complete the backup restore drill.
8. Run the k6 capacity suite on staging; meet or explicitly accept the objectives in [load-test-report.md](load-test-report.md). Only then invite 5,000 students.
