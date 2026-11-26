# Deployment (Vercel + Neon + Vercel Blob)

None of these steps have been executed by the developer: no cloud credentials were available. The steps below are the procedure to follow, and every item needs the owner's authorisation where it creates paid resources. For the beta (one shared environment on Vercel Hobby), follow section 7 only.

## 1. Environments and isolation

| Environment | Vercel | Neon | Blob store | `APP_ENV` |
|---|---|---|---|---|
| Local | — | embedded PostgreSQL (`npm run db:local:start`) | local disk `.local-media/local` | `local` |
| Preview (PRs) | Preview | **separate** Neon branch/project `staging` | **separate** private store `epapere-staging` | `preview` |
| Production | Production | Neon project `epapere-prod`, region close to `sin1` (Singapore) | private store `epapere-prod` | `production` |

Set variables **per environment** in Vercel; never give Preview the production `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` or `CRON_SECRET`. `env.ts` refuses `MEDIA_STORE=local` outside local/test and requires https origins in production. The job scheduler (section 3, step 3) must call the deployment whose origin is `APP_ORIGIN`.

## 2. Neon

1. Create the project in the region nearest the Vercel function region (`vercel.json` sets `sin1`, AWS ap-southeast-1).
2. Copy two connection strings: the pooled one (host contains `-pooler`) goes in `DATABASE_URL`, and the direct one goes in `DIRECT_DATABASE_URL` (migrations only). Both use `sslmode=require`.
3. Compute: start from the size the staging load test proves, not from defaults. Disable scale-to-zero for production during exam windows. A cold start adds seconds to the first requests.
4. Pool budget: `DATABASE_POOL_MAX` (default 5) × concurrent function instances must stay well under the pooler's server pool (`default_pool_size ≈ 0.9 × max_connections`). The pooler accepts up to 10,000 client connections, but query throughput depends on compute, not on that limit.
5. Transaction mode: the app sets `lock_timeout` and `statement_timeout` with `SET LOCAL` per transaction and does not depend on session state (tested in `session-settings.test.ts`). UTC is set as the database default by migration.

## 3. Vercel

1. Import the repo. Framework: Next.js. Install command: `npm ci`. Build command: `npm run build`. Node.js 24.
2. Environment variables: see `.env.example` (names and meaning). Required: `APP_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_POOL_MAX`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`, `CRON_SECRET`, `MEDIA_STORE` with its credentials (`cloudinary`: the three `CLOUDINARY_*` values; `vercel-blob`: `BLOB_READ_WRITE_TOKEN`), `CLIENT_IP_HEADER=x-real-ip`. Optional: `APP_EXTRA_ORIGINS`, upload limits, `LOG_LEVEL`. A missing or invalid variable stops the server at start with a list of problems (`src/instrumentation.ts`).
3. Job scheduler (required on every plan). `vercel.json` declares no cron, because Vercel Hobby rejects deployments whose cron runs more than once a day (ADR-007). Configure an external scheduler (for example cron-job.org) to send `POST https://<APP_ORIGIN host>/api/internal/jobs/run` every minute with the header `Authorization: Bearer <CRON_SECRET>`. A 200 response with JSON counts means it works; 401 means the secret is wrong. On Pro you may use Vercel Cron instead by adding `"crons": [{ "path": "/api/internal/jobs/run", "schedule": "* * * * *" }]` to `vercel.json`; it runs only on production deployments.
4. Body limit: Vercel Functions reject request bodies over 4.5 MB. App limits are lower: CSV 1 MB / 500 rows, images 2 MB, bulk students 512 KB.
5. Domain: set `APP_ORIGIN` to the exact production origin. Preview URLs must be listed in `APP_EXTRA_ORIGINS` of the **preview** environment only, otherwise mutations are rejected by the origin check.

## 4. Media store

`MEDIA_STORE=cloudinary` (ADR-009) or `vercel-blob`; both keep images private and deliver them only through `/api/v1/media/{id}`. The rest of this section describes Blob; for Cloudinary see section 7, step 2.


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
6. Verify the scheduler: its history shows a 200 every minute, the function logs show `job runner` once a minute, and `/api/internal/jobs/run` returns 401 without the secret.
7. Follow the launch checklist in [operations.md](operations.md).

## 7. Beta on Vercel Hobby (one shared environment)

One Neon database and one Cloudinary account, used both by your machine (to seed and test) and by the Vercel deployment you share with beta testers. Production later gets its own Neon project, its own Cloudinary environment and new secrets.

**1. Neon.** Create a project (for example `epapere-beta`) in AWS Asia Pacific (Singapore), close to the Vercel region `sin1`. From **Connect**, copy two connection strings: with **Connection pooling** on (host contains `-pooler`) and off (direct).

**2. Cloudinary.** Console → Settings → **API Keys**: copy the cloud name, API key and API secret. Nothing else to configure: the app uploads images as `authenticated` assets, which Cloudinary serves only to signed requests from the server.

**3. Your local `.env`** (git-ignored). Change these lines; keep the rest:

```
DATABASE_URL=<Neon pooled string>
DIRECT_DATABASE_URL=<Neon direct string>&connect_timeout=15
MEDIA_STORE=cloudinary
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<API key>
CLOUDINARY_API_SECRET=<API secret>
```

`connect_timeout=15` gives a suspended free-tier Neon compute time to wake; Prisma's default is 5 seconds. If `prisma migrate` reports P1001 while the app connects, see section 7 troubleshooting. Keep `APP_ENV=local` and `APP_ORIGIN=http://localhost:3000`. `TEST_DATABASE_URL` stays on the embedded server: automated tests reset their database and refuse anything that is not a local `*_test` / `*_e2e` database. Run `npm run db:local:start` before `npm run test:integration` or `npm run test:e2e`. To go back to fully local development, restore the two database lines and `MEDIA_STORE=local`.

**4. Set up the database once, from your machine:**

```
npx prisma migrate deploy
npm run admin:bootstrap -- --username <your.admin> --name "<Your Name>"
```

If `migrate deploy` fails on your machine with P1001 (see Troubleshooting below), apply migrations from GitHub instead: repository **Settings → Secrets and variables → Actions → New repository secret** `DIRECT_DATABASE_URL` = the Neon direct string, then **Actions → Migrate database → Run workflow** (`.github/workflows/migrate.yml`; manual only, one run at a time). `admin:bootstrap` and `db:seed` use the normal Node driver and work from your machine either way.

The bootstrap prints the database host first (check that it is the Neon host) and a temporary admin password once. Optional demo content (two labelled demo exams, students EP90001–EP90003): set `SEED_STUDENT_PASSWORD` in `.env`, then `npm run db:seed`. Real beta students: Admin → Students → **Add a student** (shows a temporary password once; the student sets a new one at first sign-in) or **Bulk registration (CSV)** (download the one-time credentials file).

**5. Vercel.** Add New → Project → import `IsuruAditya/QuizSystemEpapere` (framework Next.js, install `npm ci`, build `npm run build`, Node.js 24). Under Settings → **Environment Variables**, for **Production**:

| Name | Value |
|---|---|
| `APP_ENV` | `preview` |
| `DATABASE_URL` | Neon pooled string (same as `.env`) |
| `DIRECT_DATABASE_URL` | Neon direct string |
| `DATABASE_POOL_MAX` | `5` |
| `BETTER_AUTH_SECRET` | same value as in `.env` |
| `CRON_SECRET` | a new 32-byte random value |
| `APP_ORIGIN` | `https://<project>.vercel.app` (the domain shown under Domains) |
| `MEDIA_STORE` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | same as `.env` |
| `CLIENT_IP_HEADER` | `x-real-ip` |

Mark the secrets as **Sensitive**. Redeploy after saving. If anything is missing, the function logs list every invalid variable. Share only `APP_ORIGIN`: preview URLs change on every push and their form submissions are rejected by the origin check.

**6. Job scheduler.** At cron-job.org (free): a job every minute, method **POST**, URL `https://<project>.vercel.app/api/internal/jobs/run`, header `Authorization: Bearer <CRON_SECRET>`. Its history should show 200 each minute (401 means a wrong secret). It finalises abandoned attempts, retries grading, runs regrades and lets leaderboards become final (ADR-007).

**7. Check before inviting testers:** sign in as admin on the Vercel URL and change the password; upload an image under Media and see its thumbnail; open the exam landing page on a phone; create a practice exam with a 1-minute limit, start it, close the browser, and confirm in the exam's Results that the attempt shows as submitted within about two minutes (proves the scheduler works).

**Rules while beta testers use it:**
- Your local `npm run dev` now writes to the same data the testers see. Test with your own test students and exams, not theirs.
- Run `npx prisma migrate deploy` from your machine **before** pushing code that adds a migration, and not while testers are in a timed exam.
- Never point `TEST_DATABASE_URL` or `E2E_DATABASE_URL` at Neon (refused anyway), never run `prisma migrate reset` or `db push` against it, and never run the k6 load tests against it without agreeing first.
- Hobby is for non-commercial use, and Neon's free compute suspends when idle (the first request after a pause takes a few seconds). Production for the institute needs Vercel Pro.

**Troubleshooting: `prisma migrate` reports P1001 ("Can't reach database server") but the app connects.** Migrations run in Prisma's native engine (`schema-engine-windows.exe` on Windows), a separate program from Node. Seen once on a Windows development machine: Node reached Neon over TCP and TLS, while the engine failed even with TLS disabled; no firewall rule, Defender detection or proxy explained it. Try, in order: run the command from your own terminal (Windows Terminal or the editor's terminal, not an automation shell); allow `node_modules\@prisma\engines\schema-engine-windows.exe` if Windows Security asks; try another network (e.g. a phone hotspot). If it still fails, use the **Migrate database** GitHub Actions workflow (step 4). The app itself never needs the engine at runtime.
