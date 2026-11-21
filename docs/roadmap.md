# Scope matrix and roadmap

## Now (MVP, this release)

| Area | Delivered |
|---|---|
| Accounts | Admin and student roles; EP-ID accounts; bulk registration CSV; admin-assisted reset; disable; pseudonymise; private WhatsApp contact; CLI admin bootstrap |
| Authoring | Question bank with versions; exam create/edit/duplicate/preview/publish/unpublish (no attempts)/archive; CSV import with row-level fixes and revalidation; images with alt text; KaTeX math |
| Access | Grade-based eligibility in one service |
| Taking exams | Mobile-first runner; navigation, flags, progress; server-timed countdown; acknowledged autosave; offline recovery; writable-tab takeover; submit check; automatic expiry; untimed practice |
| Assessment | Ranked (one official attempt) and practice (max attempts); transactional grading; release-controlled review; per-exam leaderboards with provisional/final status |
| Administration | Overview (counts, failed jobs, unreconciled expiries); attempts list; statistics; CSV export; audited void and replacement; audited key correction with background regrade |
| Experience | Sinhala default and English; light and dark themes; accessible native controls; honest loading, offline and error states |
| Operations | Migrations with DB constraints; audit log; job runner; structured logs; CI workflow; k6 harness; deployment, operations and admin docs |

## Later (Post-MVP, documented, not implemented)

| Item | Reason deferred / notes |
|---|---|
| Teacher accounts, delegated permissions, teacher dashboards | Teachers are catalog records in the MVP |
| Admin MFA (Better Auth `twoFactor`), shorter admin sessions, nonce-based CSP | Security hardening (see security.md residual risks) |
| Question and option randomisation | Needs a per-attempt order table (ADR-002) |
| Extra-time accommodations | Policy decision needed (accessibility-report.md) |
| Admin UI in Sinhala | Admin UI is English; content is fully Sinhala-capable |
| XLSX/QTI import | Importer boundary exists (`StagedRow[]`) |
| Large-file direct-to-storage uploads | Current limits are 1 MB CSV / 2 MB images |
| Additional question types, certificates, notifications (WhatsApp/SMS/email) | Out of MVP scope |
| Student groups/cohorts, advanced bank search/taxonomy, richer reports, district rankings | Out of MVP scope |
| OpenTelemetry tracing export and paging alerts | Log-based monitoring for now |
| Leaderboard cache | Only if staging measurements require it (ADR-006) |
| Job-based exports, data-retention automation | Synchronous export is sufficient for one exam |

## Future integration (documentation only)

Shared sign-in, account linking and enrollment-based eligibility: see [future-student-system-integration.md](future-student-system-integration.md).

## Never in this product (per brief)

Payments/billing, live game rooms, essay or AI marking, remote proctoring, LMS, video hosting, native apps, multi-institute tenancy, a plugin marketplace.
