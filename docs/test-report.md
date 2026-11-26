# Test report

Last full run: **21 Nov 2026**, Windows 11 laptop, Node 24.14.0, embedded PostgreSQL 18.7 (UTF-8, server TimeZone Asia/Colombo, database default UTC by migration), Chromium 1255 (Playwright 1.65.1). Every result below was actually executed. Anything not executed is marked **NOT RUN**.

## Results

| Command | Result |
|---|---|
| `npm run check:encoding` | PASS (all files valid UTF-8, no mojibake) |
| `npm run lint` | PASS (0 problems, `--max-warnings=0`) |
| `npm run typecheck` | PASS |
| `npm test` (unit) | **PASS: 55/55** in 6 files (grading, CSV, timing/ranking/release, sync queue, OpenAPI contract, media storage configuration) |
| `npm run test:integration` (real PostgreSQL `epapere_test`) | **PASS: 60/60** in 6 files (attempts, ranking/import/regrade/export, security over HTTP handlers, query plans, session settings, timezone) |
| `npx prisma migrate deploy` on an empty database | PASS (integration global setup resets and migrates every run; dev and E2E databases also migrated) |
| `npm audit --omit=dev --audit-level=high` | PASS (0 vulnerabilities after overrides; see security.md) |
| `gitleaks git --config .gitleaks.toml .` (8.24.3, full history) | PASS (2 commits, no leaks; the only default-rule finding is the allowlisted E2E placeholder) |
| `npm run build` | PASS |
| `npm run test:e2e` (Playwright, desktop Chromium + Pixel 5) | **PASS: 7/7** (full admin→student flow; axe A/AA light and dark on four student screens, two viewports; keyboard; offline recovery). Re-run after the teal UI redesign |
| `npm run admin:bootstrap` | PASS (creates the first admin; a second run is refused) |
| `npm run db:seed` (twice) | PASS (idempotent) |
| k6 smoke (5 scenarios, 20 users, local) + `load-verify.ts` | PASS (see load-test-report.md). **Not a capacity result** |

## Defects found by tests and fixed (not hidden)

| Defect | Found by | Fix |
|---|---|---|
| A non-UTC DB session shifted every `timestamptz` read via the pg adapter by +5:30, which would corrupt deadlines | integration tests (all starts reported CLOSED) | migration sets database timezone UTC; regression test `tz-probe.test.ts` |
| Admin password reset revoked the session but the client then could not continue with the rotated cookie | security test | forward Better Auth's Set-Cookie on password change |
| CSV option errors were not mapped to their column | unit test | numeric path segments mapped |
| Answer timestamps used a second clock read instead of the admitted receipt time | race test | `updated_at` = the time read under the lock |
| Exam forms submitted natively before hydration (lost input; password could reach the URL) | E2E on a slow first load | `ClientForm`: POST method, disabled until hydrated |
| The answer radio was a 1 px `sr-only` element (not clickable as a target) | E2E | native radio stretched over the option card |
| Client aborts were logged as database failures | E2E server log | classified separately |
| `effect` and nested `zod` high advisories | npm audit | `overrides` to patched versions |
| k6 harness: cookie reset per iteration; reader VUs beyond the account count | k6 smoke | `noCookiesReset`; modulo accounts |
| **Race in concurrent ranked starts**: a request losing the insert race counted the winner's new attempt as "already used" and returned NO_ATTEMPTS_REMAINING instead of resuming (double-click / two tabs) | first GitHub Actions run (`attempts.test.ts`); not reproducible on the dev laptop in 30 local rounds | count only voided official attempts; the test now runs 10 rounds × 20 concurrent starts and asserts no request fails |
| Same race in **practice exams with a max-attempts limit** (the winner's new in-progress attempt was counted towards the limit) | code review after the ranked fix | count only finalised practice attempts; new test: maxAttempts=1, 10 rounds × 20 concurrent starts, none fails |
| gitleaks-action cannot scan a repository's first push (`<root>^` does not exist) | first GitHub Actions run | pinned, checksum-verified gitleaks CLI scanning full history; `.gitleaks.toml` allowlists only the two documented E2E placeholder literals (verified: realistic secrets are still detected) |
| Teal redesign: phone language toggle showed "EN" while its accessible name was "Language: English" (WCAG 2.5.3 label-in-name) | axe in E2E (`label-content-name-mismatch`, both themes) | visible full language name; accessible name built from visible text plus a screen-reader-only prefix |
| Unlayered global CSS (fieldset reset, `:focus-visible` radius, `img` height) overrode Tailwind's layered utilities, dropping form margins and squaring focused rounded controls | screenshot review of the redesign | element defaults moved into `@layer base` |

## NOT RUN (and why)

| Item | Reason | Needed to run |
|---|---|---|
| GitHub Actions CI, CodeQL (full green run) | first run found two defects (above); re-run pending after the fix | check the Actions tab after the push |
| Capacity tests at 5,000 students | no staging infrastructure or external load generator | see load-test-report.md |
| k6 `exam_session` (60 min) and `expiry` smoke | time; planned on staging | staging run |
| Firefox/Safari/real Android devices | only Chromium installed | Playwright WebKit/Firefox + device lab |
| Manual screen-reader passes (NVDA, TalkBack, VoiceOver) | manual | accessibility-report.md checklist |
| axe on admin, result and leaderboard pages | not yet scripted | extend `mobile-a11y.spec.ts` |
| Backup restore drill | needs Neon | operations.md |
| Vercel/Neon/Blob deployment checks (TLS, pooler behaviour, job scheduler, Blob private reads) | no credentials | deployment.md |
| Cloudinary adapter against a real account (upload as `authenticated`, signed server-side read, unsigned URL refused) | no credentials; unit tests cover only configuration validation and key mapping | deployment.md section 7, step 7 (upload an image under Media and see its thumbnail) |
| Job lease crash/takeover under real process kill | lease logic implemented; only retry/recovery paths tested | add a test that expires a lease mid-run |

## How to reproduce

```bash
npm run db:local:start   # keep running
npm run check:encoding && npm run lint && npm run typecheck
npm test
npm run test:integration
npm run build && npm run test:e2e
npm audit --omit=dev --audit-level=high
```
