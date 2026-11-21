# Deployment (Vercel + Neon + Vercel Blob)

None of these steps have been executed. No production credentials were available during development. The steps below are the procedure to follow, and every item needs the owner's authorisation where it creates paid resources.

## 1. Environments and isolation

| Environment | Vercel | Neon | Blob store | `APP_ENV` |
|---|---|---|---|---|
| Local | — | embedded PostgreSQL (`npm run db:local:start`) | local disk `.local-media/local` | `local` |
| Preview (PRs) | Preview | **separate** Neon branch/project `staging` | **separate** private store `epapere-staging` | `preview` |
| Production | Production | Neon project `epapere-prod`, region close to `sin1` (Singapore) | private store `epapere-prod` | `production` |

Set variables **per environment** in Vercel; never give Preview the production `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` or `CRON_SECRET`. `env.ts` refuses `MEDIA_STORE=local` outside local/test and requires https origins in production. Vercel Cron runs only on the production deployment.

## 2. Neon

1. Create the project in the region nearest the Vercel function region (`vercel.json` sets `sin1`, AWS ap-southeast-1).
2. Copy two connection strings: the pooled one (host contains `-pooler`) goes in `DATABASE_URL`, and the direct one goes in `DIRECT_DATABASE_URL` (migrations only). Both use `sslmode=require`.
3. Compute: start from the size the staging load test proves, not from defaults. Disable scale-to-zero for production during exam windows. A cold start adds seconds to the first requests.
4. Pool budget: `DATABASE_POOL_MAX` (default 5) × concurrent function instances must stay well under the pooler's server pool (`default_pool_size ≈ 0.9 × max_connections`). The pooler accepts up to 10,000 client connections, but query throughput depends on compute, not on that limit.
5. Transaction mode: the app sets `lock_timeout` and `statement_timeout` with `SET LOCAL` per transaction and does not depend on session state (tested in `session-settings.test.ts`). UTC is set as the database default by migration.

## 3. Vercel

1. Import the repo. Framework: Next.js. Install command: `npm ci`. Build command: `npm run build`. Node.js 24.
2. Environment variables: see `.env.example` (names and meaning). Required: `APP_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_POOL_MAX`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`, `CRON_SECRET`, `MEDIA_STORE=vercel-blob`, `BLOB_READ_WRITE_TOKEN`, `CLIENT_IP_HEADER=x-real-ip`. Optional: `APP_EXTRA_ORIGINS`, upload limits, `LOG_LEVEL`. A missing or invalid variable stops the server at start with a list of problems (`src/instrumentation.ts`).
3. Plan: **Pro or higher** is required for the per-minute cron in `vercel.json`. On Hobby, configure an external scheduler to `POST /api/internal/jobs/run` with `Authorization: Bearer $CRON_SECRET` every minute.
4. Body limit: Vercel Functions reject request bodies over 4.5 MB. App limits are lower: CSV 1 MB / 500 rows, images 2 MB, bulk students 512 KB.
5. Domain: set `APP_ORIGIN` to the exact production origin. Preview URLs must be listed in `APP_EXTRA_ORIGINS` of the **preview** environment only, otherwise mutations are rejected by the origin check.

## 4. Vercel Blob (private)

Create a **private** store per environment and connect it to the project; Vercel sets `BLOB_READ_WRITE_TOKEN`. Objects are written as `media/<kind>/<uuid>.<ext>` with `access: "private"`. Every read goes through `/api/v1/media/{id}`, which authorises the request: question images only for admins and students holding an attempt that uses them; teacher photos and covers are public with a 24 h cache. Raw import CSVs are never stored as files; parsed rows and the SHA-256 are kept in the database.

## 5. Database migrations

```bash
DATABASE_URL=<direct> DIRECT_DATABASE_URL=<direct> npx prisma migrate deploy
```

- Run from CI or a trusted machine **before** promoting the new deployment, never during an exam window. Check `npx prisma migrate status` first.
- Migrations are additive (expand). For breaking changes, use expand → deploy app → backfill (bounded batches) → contract in a later release, so old and new versions can overlap.
- Rolling back the application does **not** roll back a migration. Only roll back to an app revision that is compatible with the current schema.
- Never run `prisma migrate reset` or `db push` against staging or production.

## 6. First-run steps (in order)

1. Neon project and branches, the Blob stores, and Vercel environment variables (as above).
2. `prisma migrate deploy` against production (direct URL).
3. `npm run admin:bootstrap -- --username <name> --name "<Full name>"` from a trusted machine with the production `DATABASE_URL`. It prints the host first: check it. The temporary password is printed once.
4. Sign in, change the password, add teachers with **real** photos, and set branding in Settings.
5. Do **not** run `npm run db:seed` in production (it refuses `APP_ENV=production`).
6. Verify the cron: Vercel → Project → Cron Jobs shows runs; `/api/internal/jobs/run` returns 200 only with the secret.
7. Follow the launch checklist in [operations.md](operations.md).
