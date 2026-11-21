# Future student management system (SMS) integration

**Documentation only. Nothing here is implemented in this release.** e-Paperé Exams launches standalone and works without an SMS.

## Boundaries already in place (implemented now, low cost)

| Boundary | Where |
|---|---|
| Immutable internal user IDs (UUID) separate from the human EP login ID. Attempts reference the internal ID, never a phone number or name | `user.id`, `student_profile.ep_id` |
| Identity resolution in one place; services receive an explicit `Actor` | `src/server/auth/actor.ts` |
| Eligibility in one small pure function (MVP rule: enabled student whose grade equals the exam grade) | `src/server/assessment/eligibility.ts` |
| Typed public contracts with stable IDs; DTOs separate from ORM models | `docs/openapi.json`, `src/lib/attempt/types.ts` |
| Durable job table with a transactional outbox pattern, reusable for future notifications | `src/server/platform/jobs.ts` |

## Planned ownership (validate when the SMS is designed)

| Data / capability | Now | Connected platform |
|---|---|---|
| Credentials, sessions | Exams (Better Auth) | Shared OpenID Connect provider. Each app validates identity and keeps its own sessions and access rules |
| Student profile, enrollment | Minimal local profile; no enrollment | SMS owns profile and enrollment; Exams keeps a local projection needed for exams |
| Exams, questions, attempts, grades, ranks | Exams | Exams stays authoritative. SMS reads authorised results through an API |
| Payments, class access | Out of scope | SMS/payments; exposes only an eligibility decision to Exams |

## Path when the SMS exists

1. **Shared sign-in (preferred):** add an OIDC client to Exams through Better Auth's maintained generic OAuth/OIDC support. Do not build a custom SSO token or share session tables. EP-ID login can remain a policy of the identity provider; no student email or OTP is required.
2. **Account linking:** add `external_identity (issuer, subject) UNIQUE → user.id` with an audited admin flow. Never link by WhatsApp number, name or another unverified field. Exam history stays on the original internal ID. Plan credential migration, session revocation and rollback explicitly.
3. **Eligibility:** replace or extend `isEligible()` with an enrollment check evaluated **at attempt start**. A later revocation does not cancel an attempt already in progress. If the SMS is down, new starts fail closed with a clear message, and accepted answers and running attempts are unaffected. An identity-provider outage must never fall back to insecure local login.
4. **Data exchange:** start with narrowly scoped, authenticated read APIs (for example "results for student X, exam Y" with stable result and version IDs). Add signed webhooks from the existing outbox only when a real sync need exists, with idempotent consumers and reconciliation. Never write directly into the other application's tables, and never call the SMS on the answer-save path.

## Options at integration time

| Approach | When it fits | Trade-off |
|---|---|---|
| Stay standalone | Links plus occasional exports are enough | Lowest work; separate account administration continues |
| Shared sign-in + APIs (**recommended**) | A unified student journey is wanted | Account mapping and authorisation work; exams keep independent scaling and releases |
| Merge code and deployment | One team, one stack, shared release cycle | Keep the module boundaries; plan schema and data migration plus regression and load tests; more deployment coupling |

None of these is guaranteed to need zero changes. Moving to a different database would be a migration project, not a configuration change.
