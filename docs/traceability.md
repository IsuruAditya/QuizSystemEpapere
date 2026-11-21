# Traceability matrix

Status key: **V** = implemented and verified by an executed test · **P** = implemented, partly verified · **U** = implemented, unverified · **N/A** with reason. Requirement IDs are from [requirements.md](../.kiro/specs/epapere-exams/requirements.md). Tests: `u/` = tests/unit, `i/` = tests/integration, `e/` = tests/e2e.

## Brief §19 required tests

| # | Invariant | Status | Evidence |
|---|---|---|---|
| 1 | CSV: Sinhala, BOM, commas, multiline, CRLF | V | `u/csv-import` (shipped example fixture) |
| 2 | Invalid keys/malformed rows cannot publish; failed import leaves published exam unchanged | V | `u/csv-import` invalid fixture; `i/ranking-import` "invalid rows block commit", "published exams are never modified" |
| 3 | Retried import commit does not duplicate | V | `i/ranking-import` two concurrent commits → one insert |
| 4 | A/B/C/D, first and last option, stable IDs | V | `u/grading`; `i/attempts` keys A,D,B,C,B. Shuffle N/A (randomisation is Post-MVP) |
| 5 | All-correct/wrong/partial/weighted/unanswered | V | `u/grading`; `i/attempts` five independently computed cases |
| 6 | Server totals; forged values and foreign IDs rejected | V | `i/attempts` foreign question/option/other-exam; Zod strips unknown fields; no client score/time field exists |
| 7 | Concurrent starts → one attempt | V | `i/attempts` 20 parallel starts |
| 8 | Refresh/re-login preserves deadline, selections, order | V | `i/attempts` resume; `e/full-flow` reload |
| 9 | Clock changes, sleep, throttling don't extend the exam | P | Server-side deadline enforcement tested (`i/attempts` saves after deadline); client uses a monotonic clock plus resync on wake (code). No browser clock-change test |
| 10 | Out-of-order/duplicate saves cannot overwrite newer | V | `i/attempts` CAS, duplicate, concurrent same-base; `u/sync-queue` |
| 11 | Tabs/devices controller policy; shared-device isolation | V | `i/attempts` takeover; `u/sync-queue` read-only + `loadLocal` other-user purge |
| 12 | Select then immediately submit includes the choice | V | `i/attempts` finalChanges; `u/sync-queue` drainForSubmit; `e/full-flow` Q3 then submit |
| 13 | Save vs submit vs expiry races coherent | V | `i/attempts` race (5 rounds) |
| 14 | Duplicate/concurrent submit, response loss → canonical result, same time | V | `i/attempts` |
| 15 | DB failure: no partial writes, no fake scores; answers survive | V | `i/attempts` trigger-injected failure; grading-fault → NULL score + recovery job |
| 16 | Browser closed at expiry reconciled with deadline duration | V | `i/attempts` |
| 17 | Late client timestamps can't bypass the deadline | V | `i/attempts` late submit with offline answers is a no-op receipt |
| 18 | Per-exam ranking, ties, pagination, isolation, exclusions | V | `u/timing-ranking-release`; `i/ranking-import` (§13 examples, 1,2,2,4, page boundaries, exam B isolation, void/practice/in-progress) |
| 19 | Provisional/final; regrade changes scores, not times | V | `i/ranking-import` |
| 20 | No keys/explanations before release (API, HTML, hydration, caches) | P | API payloads: `i/attempts`, `i/security`, `i/ranking-import`, `u/openapi`; no-store asserted. HTML/RSC payload not separately scraped (the attempt page passes only the key-free DTO) |
| 21 | Students can't read others, admin endpoints, exports, roles | V | `i/security`. Teacher login N/A (not in MVP) |
| 22 | CSRF, throttling, reset/session invalidation, disable, malicious upload/rendering | P | `i/security` all except rendering; XSS safety by code review (React text + KaTeX `trust:false`) |
| 23 | Export formula neutralisation and scope | V | `i/ranking-import` export; `i/security` 403 for students |
| 24 | UTC/Colombo conversion, late-start shorter duration | V | `u/timing-ranking-release`; `i/attempts` late start; `i/tz-probe` |
| 25 | Playwright full flow | V | `e/full-flow` |
| 26 | Mobile, keyboard, Sinhala, pending states, accessible radios | P | `e/mobile-a11y` (Chromium only; no manual AT) |
| 27 | Job crash/retry; service failures recoverable | P | grading-fault job recovery, lock-timeout fail-fast (`i/session-settings`), regrade job. Lease-expiry takeover not directly tested. Redis N/A (not used) |
| 28 | Untimed practice: no countdown or expiry, resumable, not ranked | V | `i/attempts`; countdown hidden when `deadlineAt` is null (code) |

## Requirements summary

| Group | Status | Notes |
|---|---|---|
| R1 Scope, R2 Accounts/auth | V (except R2.16 POST) | admin MFA is a documented gap |
| R3 Authoring/import/media | V | KaTeX rendering by code review |
| R4 Student experience | P | WCAG AA claimed only as a target (accessibility-report.md) |
| R5 Attempts/saving, R6 Grading/expiry | V | |
| R7 Ranking, R8 Review/regrade | V | |
| R9 Administration | P | Admin screens covered by E2E (import, publish) plus service tests; no axe on admin screens |
| R10 API/errors | V | OpenAPI generated from Zod; contract test |
| R11 Operations | P | CI configured but NOT RUN; capacity NOT VERIFIED; restore drill NOT RUN |
| R12 Integration boundaries | V (boundaries) / FUT (rest) | future-student-system-integration.md |
