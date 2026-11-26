# e-Paperé Exams

Online MCQ exams and quizzes for e-Paperé Online Institute (grades 6–11). Administrators upload a CSV, validate and fix it in the browser, preview, publish and share a link. No code change or redeploy is needed per paper. Students sign in with their EP ID, take timed or practice exams with acknowledged autosave and recovery, and see release-controlled results and a **separate leaderboard for each exam**.

Status: **MVP code complete and locally verified; not yet staging- or capacity-verified.** See [docs/status-report.md](docs/status-report.md). Do not invite 5,000 students until the capacity tests in [docs/load-test-report.md](docs/load-test-report.md) pass on production-equivalent infrastructure.

## Stack (installed versions)

| Area | Choice |
|---|---|
| Runtime | Node.js 24 LTS (`engines: >=22`) |
| App | Next.js 16.4.6 (App Router, Node runtime route handlers, `proxy.ts` not used), React 19.3.1, TypeScript 5.9.3 strict |
| UI | Tailwind CSS 4.3.5, small in-repo accessible component set (ADR-008), KaTeX 0.19.1 (`trust:false`) |
| Data | PostgreSQL (Neon in production; real embedded PostgreSQL 18.7 locally), Prisma 7.10.1 + `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1 |
| Auth | Better Auth 1.7.26 (username plugin, database sessions, scrypt N=16384 r=16 p=1) via server API only |
| Validation | Zod 4.6.7 |
| Files | Cloudinary 2.11.0 SDK, authenticated assets (ADR-009), or Vercel Blob 2.9.0 private store; local disk (dev/test with a local database) |
| Tests | Vitest 5.1.1, Playwright 1.65.1 + axe-core 4.14.0, k6 scripts |

## Local setup

Prerequisites: Node.js 22+ (24 recommended). No Docker is needed; a real PostgreSQL server runs from npm binaries.

```bash
npm ci
cp .env.example .env            # then set BETTER_AUTH_SECRET and CRON_SECRET (see comments in the file)
npm run db:local:start          # terminal 1: PostgreSQL on 127.0.0.1:54329 (dbs epapere_dev, epapere_test); keep running
npx prisma migrate deploy       # terminal 2
npm run admin:bootstrap -- --username admin.yourname --name "Your Name"   # prints a one-time password
npm run db:seed                 # optional NON-PRODUCTION demo data (two labelled demo exams, students EP90001–3)
npm run dev                     # http://localhost:3000
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never paste real secrets into chat, issues or source control.

The database runs in UTC (enforced by migration `20261120000200_utc_timezone`). The UI displays Asia/Colombo.

## Commands

| Command | What it does |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint (0 warnings allowed) / `tsc --noEmit` |
| `npm test` | Unit tests (pure rules, CSV, sync queue, OpenAPI contract) |
| `npm run test:integration` | Real PostgreSQL tests on `TEST_DATABASE_URL` (default `epapere_test`; the test resets it) |
| `npm run build` then `npm run test:e2e` | Playwright full journey + axe accessibility on desktop and Pixel 5 (db `epapere_e2e`, port 3100) |
| `npm run openapi` | Regenerate `docs/openapi.json` from the route Zod schemas (a unit test fails if stale) |
| `npm run check:encoding` | Fail on invalid UTF-8 or mojibake (protects Sinhala text) |
| `npm run load:prepare` + `k6 run load/k6/scenarios.js` | Capacity harness on a **staging** database ([docs/load-test-report.md](docs/load-test-report.md)) |
| `npm audit --omit=dev --audit-level=high` | Dependency review (CI also runs gitleaks and CodeQL) |

## Where things are

```
src/app/            pages and thin route handlers (api/v1/**, api/internal/jobs/run)
src/server/<module> business logic: auth, users, catalog, authoring, imports, media, assessment, results, platform
src/lib/            client-safe code: i18n (Sinhala/English), sync queue, typed API clients, time, phone
src/components/     UI (ui/ design system, exam/ runner, admin/ forms)
prisma/             schema + migrations (raw SQL for partial unique indexes, CHECKs, membership FKs)
tests/              unit, integration (real PostgreSQL), e2e (Playwright), fixtures (CSV)
load/k6/            capacity scenarios
docs/               architecture, ADRs, OpenAPI, guides, reports
.kiro/              specs (requirements/design/tasks) and steering
```

## Documentation

- [Architecture, data model, timing/concurrency and ranking policy](docs/architecture.md) · [ADRs](docs/adr.md) · [OpenAPI 3.1](docs/openapi.json)
- [Deployment (Vercel + Neon + Cloudinary or Blob)](docs/deployment.md) · [Operations, backup/restore, exam-day, launch checklist](docs/operations.md)
- [Admin guide](docs/admin-guide.md) · [Security and threat model](docs/security.md) · [Accessibility report](docs/accessibility-report.md)
- [Engineering standards mapping](docs/engineering-standards.md) · [Requirement traceability](docs/traceability.md)
- [Test report](docs/test-report.md) · [Load-test report](docs/load-test-report.md) · [Status report](docs/status-report.md)
- [Scope matrix and roadmap](docs/roadmap.md) · [Future student-system integration](docs/future-student-system-integration.md)
- Templates: `src/content/templates/` (question template, Sinhala/English example, student registration template)
