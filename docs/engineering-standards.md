# Engineering standards mapping (§23)

This maps practices and standards to their implementation and evidence. It is **not** a certification or a compliance claim. Statuses: Implemented and verified / Implemented but unverified / Not implemented / Not applicable.

| Standard / practice | Implementation | Evidence | Status |
|---|---|---|---|
| OWASP ASVS 5.0.0 L2 (target) | see security.md chapter table | `i/security`, `i/attempts` | Partly verified; full L2 review **not done**; admin MFA **not implemented** |
| WCAG 2.2 AA (target) | native controls, focus, status messages, themes, Sinhala `lang` | axe E2E (4 student screens × 2 themes × 2 viewports) | Partly verified; manual AT **not done** |
| OpenAPI 3.1 | `docs/openapi.json` generated from route Zod schemas | `u/openapi` (fresh + every route documented) | Implemented and verified |
| HTTP semantics (RFC 9110) | no GET mutations (except the cron dispatcher, authenticated and idempotent: ADR-007); 401/403/404/409/413/415/422/429/503 | security and contract tests | Implemented and verified |
| Problem Details (RFC 9457) | `withRoute` → `application/problem+json` with `code`, `requestId`, `errors[]` | security tests | Implemented and verified |
| Idempotency and conditional updates | `mutationId` scoped to the attempt; revision CAS under row lock; canonical receipt after finalisation | `i/attempts` | Implemented and verified |
| SOLID / DRY / KISS / YAGNI (pragmatic) | thin `withRoute` handlers; services per module; pure rules (grading, ranking, release, deadline, CSV); `useMutation` and typed API clients; injected deps (media store, sync-queue interfaces) | lint rules: no `@/server/db` in `src/app`, no server imports in client code | Implemented and verified (lint) |
| Strict TypeScript, no `any`, validated boundaries | `strict`, `noUncheckedIndexedAccess`; Zod at routes, env, JSON columns, job payloads, auth user fields | `npm run typecheck`, `npm run lint` | Implemented and verified |
| Fail fast | env validated at startup (`instrumentation.ts`); typed path params → 404 | security test (malformed ID) | Implemented and verified |
| DB integrity (constraints, partial indexes, composite FKs, RESTRICT) | migrations | `i/attempts` (DB rejects a second official attempt) | Implemented and verified |
| Transaction discipline | short tx, `SET LOCAL` lock/statement timeouts, no network calls inside tx, SKIP LOCKED batches | `i/session-settings`, race tests | Implemented and verified (locally) |
| Migrations from empty database | `prisma migrate reset/deploy` in test setup | every integration run | Implemented and verified |
| Upgrade-path migration test (previous schema → new) | first release; no previous schema exists | — | Not applicable yet (add from the second migration release) |
| Query plans reviewed | `i/query-plans` (46,000 attempts) | `test-results/query-plans.txt`, architecture.md | Implemented and verified (local data) |
| Dependency review and licences | `npm audit` + overrides; licences recorded | security.md | Implemented and verified |
| Secret scanning, SAST | gitleaks, CodeQL in CI | — | Implemented but unverified (CI **not run**) |
| CI pipeline | `.github/workflows/ci.yml` (frozen install, encoding, lint, typecheck, unit, migrate, integration, build, E2E, audit) | — | Implemented but unverified. **Remaining:** push to GitHub, pin actions to SHAs, enable branch protection and required checks |
| Structured logs, correlation IDs, redaction | `platform/logger.ts`, `X-Request-Id` | tests read `requestId` | Implemented and verified |
| OpenTelemetry metrics/traces | — | — | Not implemented (Post-MVP; log-based monitoring documented) |
| Backups and restore drill | Neon PITR procedure | — | Implemented (procedure) but unverified |
| ADRs | docs/adr.md (8 records) | — | Implemented |

Owner/responsibility: the institute's technical lead is accountable for the unverified items before the 5,000-student release (see status-report.md).
