# Status report (21 Nov 2026)

| Gate | State |
|---|---|
| Code complete (MVP scope) | **Yes** |
| Verified locally (lint, types, 44 unit, 60 PostgreSQL integration, 7 E2E, audit, build) | **Yes** (see test-report.md) |
| Staging verified (Vercel + Neon + Blob) | **No**: needs credentials and owner authorisation |
| Capacity verified (5,000 concurrent) | **No**: only local smoke runs (load-test-report.md) |
| Production released | **No** |

## Completed (MVP)

- **Accounts:** admin-created EP-ID accounts, bulk registration, admin-assisted reset (password re-confirmation, session revocation, forced change), disable, pseudonymise, CLI admin bootstrap, per-account login throttle that does not block shared networks.
- **Authoring:**
  - Question bank with immutable versions.
  - Exam lifecycle (draft/publish/unpublish-before-attempts/archive/duplicate) and admin preview with answer key.
  - CSV import with row-level errors, in-place fixes, revalidation and idempotent all-or-nothing commit.
  - Private image uploads with alt text; KaTeX math; Sinhala throughout.
- **Exams:**
  - Grade-based eligibility in one service.
  - Server-timed attempts with acknowledged autosave, offline recovery, a single writable tab with takeover, submit review, automatic expiry, and untimed practice.
- **Grading and ranking:**
  - Transactional grading with no fake scores.
  - Release-controlled review.
  - A separate leaderboard per exam (score, then time; 1,2,2,4) with provisional/final status, audited void and replacement, and audited key correction with background regrade.
- **Operations:** DB-enforced invariants, audit log, job runner with leases, structured logs, OpenAPI, CI workflow, k6 harness, deployment/admin/operations guides.

## Remaining blockers before inviting 5,000 students

1. **Provision staging and production** (staging works on Vercel Hobby with an external job scheduler, deployment.md section 7; production needs Vercel Pro for commercial use, Neon compute and private Blob stores). This needs your authorisation and paid accounts.
2. **Configure secrets** in Vercel per environment. Never share them in chat.
3. **Run CI on GitHub**, pin the action SHAs, and enable required checks.
4. **Staging capacity tests** at 50 % / 100 % / 150 %, with an external load generator, including the 60-minute soak and expiry reconciliation. Run `load-verify.ts` after each.
5. **Restore drill** on a Neon branch.
6. **Manual accessibility checks** (NVDA, TalkBack, VoiceOver) and Safari/Firefox/real Android.
7. **Owner decisions:**
   - extra-time accommodation policy;
   - audit retention period;
   - admin MFA before launch, or accept the risk;
   - pilot group size.
8. Upload **real teacher photos and branding**. The seed has a labelled placeholder teacher with no photo.

## Known limitations

- The admin interface is English only (student UI is Sinhala/English).
- Single-answer four-option MCQs only; no randomisation; no accommodations; no teacher accounts.
- The CSP permits inline scripts (Next.js without nonces).
- Uploads are capped at 1 MB CSV and 2 MB images; larger files need a direct-to-storage path (Post-MVP).
- Leaderboards are computed per request without a cache (measured at about 11 ms for 5,000 rows locally; to be confirmed on staging).
