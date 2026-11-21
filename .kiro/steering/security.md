# Security rules

- Every route uses `withRoute()` with an explicit `auth` option ("public" | "student" | "admin" | "any"); mutations get the origin check automatically.
- Authorise objects on the server (attempt.user_id = actor.id, exam eligibility). Hidden UI is not authorisation.
- Never log or return passwords, hashes, session tokens, answer keys, WhatsApp numbers. Use `logger` (redacting) not `console`.
- Secrets only via `src/server/env.ts`; never `NEXT_PUBLIC_*` for secrets. No default credentials; first admin via CLI.
- Uploads: magic-byte sniffing (PNG/JPEG/WebP), size/dimension caps, generated IDs, no SVG/HTML, no URL fetch.
- Render untrusted text as React text; KaTeX with `trust: false`. No `dangerouslySetInnerHTML` except KaTeX output.
- CSV exports pass through `csvSafeCell()` (formula-injection neutralisation).
- Personalised responses: `Cache-Control: no-store`. Internal job endpoint requires `Bearer CRON_SECRET`.
- Sensitive admin actions (password reset, void, grading correction) require password re-confirmation and write an audit event.
