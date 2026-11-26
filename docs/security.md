# Security: threat model, controls and residual risk

Verification target: **OWASP ASVS 5.0.0 Level 2**. This is a target, **not a compliance claim**. The table below covers the chapters that apply to this application, with status and evidence. A full requirement-by-requirement L2 review has **not** been completed; it is listed under residual risks.

## Assets and trust boundaries

| Asset | Who may access | Boundary |
|---|---|---|
| Answer keys, explanations before release | admins only | server: `results/release-policy.ts`, student DTOs built from explicit selects |
| Attempts, answers, results | owning student; admins | `userId` filter in every attempt/result query (others get 404) |
| Student contact data (WhatsApp, school) | admins | never in leaderboard rows (tested) or student APIs |
| Question images before an attempt | admins; students with an attempt on that exam version | `media.canView` |
| Credentials and sessions | the user | Better Auth (scrypt), HttpOnly SameSite=Lax cookie, DB sessions |
| Job runner | the scheduler | `Bearer CRON_SECRET` (constant-time compare) |
| Exports (personal data) | admins | admin-only route, audited, formula-neutralised |

## Abuse cases and controls

| Abuse case | Control | Test evidence |
|---|---|---|
| Read another student's attempt by guessing an ID | owner filter → 404 | `security.test.ts`, `attempts.test.ts` |
| Read keys from the attempt payload, HTML or hydration data | keys never selected into student DTOs; result details only after release | attempts payload test, release test, OpenAPI test |
| Forge score, time or a foreign option | score computed server-side; DB clock; composite FKs + service check | "rejects foreign question IDs…" |
| Submit after the deadline / offline answers | admission under row lock; late finalChanges ignored | deadline tests |
| Duplicate official attempts | partial unique index | 20 concurrent starts |
| Cross-site request (CSRF) | Origin allow-list / `Sec-Fetch-Site: same-origin` on all mutations; SameSite=Lax | `security.test.ts` |
| Password guessing | per-account failure lock + per-IP ceiling (shared networks still work); generic error | throttle test |
| Account takeover after reset | sessions revoked; forced password change | reset test |
| Malicious upload (SVG/HTML as .png) | magic-byte sniff + dimension parse; server-generated keys; `nosniff` | upload test |
| Stored XSS via imported text | React text rendering; KaTeX `trust:false`, no macros; CSP | code review (no `dangerouslySetInnerHTML` except KaTeX output) |
| CSV formula injection in exports | `csvSafeCell` prefixes `= + - @ TAB CR` | export test |
| SSRF through image URLs in CSV | URLs rejected; only media IDs accepted | CSV validation test |
| Open redirect via `returnTo` | `safeReturnTo` allows only same-origin relative paths | unit-level (function) |
| Password in URL on slow networks | `ClientForm` uses `method="post"` and disables controls until hydration | E2E asserts `method="post"` |
| Role escalation | no web endpoint changes roles; admins only via CLI | security test |
| Job endpoint abuse | bearer secret; bounded work; SKIP LOCKED / leases | security test |
| Preview deployment touching production | per-environment variables; `APP_ENV` guards (local media forbidden outside local/test) | deployment.md |

## ASVS 5.0 chapter applicability (summary)

| Chapter | Applicability | Status |
|---|---|---|
| Encoding and sanitisation | applies | Implemented and verified (parameterised tagged-template SQL everywhere; in application code `$executeRawUnsafe` appears only in `db.ts` for two `SET LOCAL` statements built from constants/integers; React escaping; CSV neutralisation) |
| Validation and business logic | applies | Implemented and verified (Zod at every boundary; DB constraints; idempotency) |
| Web frontend security | applies | Implemented, partly verified (CSP with `'unsafe-inline'` for the Next bootstrap — nonce CSP is a gap; frame-ancestors none; nosniff; HSTS in production) |
| API and web service | applies | Implemented and verified (problem details, no-store, size limits, origin checks) |
| File handling | applies | Implemented and verified (type sniffing, size/dimension caps, private storage, authorised delivery) |
| Authentication | applies | Implemented and verified for password, throttling and reset; **MFA for admins not implemented** |
| Session management | applies | Implemented and verified (DB sessions, revocation, HttpOnly/SameSite/Secure); single 12 h lifetime for all roles |
| Authorization | applies | Implemented and verified (role guard in `withRoute`, object ownership in services) |
| Self-contained tokens, OAuth/OIDC, WebRTC | not applicable in MVP (no tokens issued to clients; no SSO) | N/A |
| Cryptography | library-provided (scrypt via Better Auth; TLS by platform) | Implemented; no custom crypto |
| Secure communication | platform TLS (Vercel, Neon `sslmode=require`) | Unverified until deployed |
| Configuration | applies | Implemented (env validation, secrets only in env, no default credentials); CI secret scan configured, not yet run |
| Data protection | applies | Implemented (minimised leaderboard fields, redacted logs, pseudonymisation); retention policy awaits owner confirmation |
| Security logging | applies | Implemented (audit events for admin actions; structured logs); alert wiring pending |

## Residual risks and gaps (owner decisions needed)

1. **No MFA for administrators** and a 12-hour admin session. Mitigation: password re-confirmation for resets, voids and key corrections; few admins. Post-MVP: Better Auth `twoFactor` and shorter admin sessions.
2. **CSP allows inline scripts** (required by Next.js without a nonce pipeline). Mitigated by React escaping and no user HTML. Post-MVP: nonce-based CSP.
3. **No full ASVS L2 line-by-line review yet.** Recommended before the 5,000-student release.
4. Better Auth compares scrypt-derived keys with `===` (not constant-time). Practical risk is negligible because the attacker cannot steer the derived key; noted for upstream.
5. Login throttling uses DB writes per failed attempt. Under a credential-stuffing flood this load lands on PostgreSQL; the staging test must include it. Add an edge WAF rule if needed.
6. The per-IP ceiling uses the platform header `x-real-ip` (`CLIENT_IP_HEADER`). This header must be the one Vercel sets, so it cannot be spoofed there; verify after deployment.

## Dependency and supply-chain review (20 Nov 2026)

- `npm audit --omit=dev`: 7 high findings from two roots, fixed with `overrides` to patched versions in the same major, then **0 vulnerabilities**:
  - `effect` ≤3.22.0 ReDoS (GHSA-7589-6fvf-x4pw) via the Prisma CLI config loader. Not reachable by request input. Overridden to 3.22.5.
  - `zod` <4.6.6 memory exhaustion (GHSA-mrhx-c7xc-m3w5) in a nested copy under `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config`. The app's own zod is 4.6.7. Overridden to 4.6.7.
- Licences of major runtime dependencies (read from each package.json): MIT for next, react, react-dom, better-auth, zod, katex, csv-parse, csv-stringify, image-size, pg, server-only and cloudinary (with its dependency lodash); Apache-2.0 for @prisma/client, @prisma/adapter-pg and @vercel/blob. No copyleft licence among the production dependencies. Apache-2.0 requires keeping the licence and NOTICE files when redistributing (normal npm installs keep them).
- CI includes `npm audit --audit-level=high`, gitleaks and CodeQL. These are **configured, not yet run** (no GitHub run was available). The GitHub Actions use major-version tags; pin them to reviewed commit SHAs before making the checks required.
