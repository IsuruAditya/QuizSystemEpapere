# Stack and structure

Authoritative brief: `docs/brief/ePapere-Kiro-Master-Prompt.md`; spec: `.kiro/specs/epapere-exams/`.

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4. Node runtime for all route handlers. `proxy.ts` (not middleware.ts).
- PostgreSQL (Neon in prod, embedded real Postgres locally: `npm run db:local:start`). Prisma 7 with `@prisma/adapter-pg`; generated client in `src/generated/prisma` (git-ignored). Raw parameterised SQL (`$queryRaw` tagged templates) only for locking, CAS and ranking.
- Better Auth 1.7 (username plugin, DB sessions) used through `auth.api.*` server calls only.
- Zod 4 for every external input. Vitest (unit + integration projects), Playwright, k6.
- Modular monolith: business logic in `src/server/<module>`; route handlers in `src/app/api/v1/**` stay thin and use `withRoute()`.
- Never import `src/server/**` from client components. Never add Redis, queues, or new services without an ADR in `docs/adr/`.
- Keep it simple (KISS/YAGNI): no repository layer, no DI container, no plugins. Post-MVP items live in `docs/roadmap.md`.
