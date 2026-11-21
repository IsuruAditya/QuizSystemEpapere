# Business rules (non-negotiable)

- Rankings are per exam only: eligible = OFFICIAL + GRADED + not void + latest grading revision; order `score DESC, elapsed_ms ASC`; competition rank (1,2,2,4). Never combine exams.
- Score = sum of marks of correctly answered questions; no negative marks; unanswered = 0; `score` is NULL until grading succeeds. Never fake 0/1.
- Deadline = min(started_at + duration, closes_at); untimed practice may have NULL deadline. Server time (`clock_timestamp()` under the attempt row lock) is the only clock. No answers admitted at/after the deadline.
- Manual elapsed = server receipt − started; expiry elapsed = deadline − started. Never changed by retries or regrades.
- RANKED: one non-void official attempt per student per exam (DB-enforced). PRACTICE never affects rankings.
- Published exam versions and question versions are immutable; key fixes go through an audited grading revision + regrade.
- Eligibility (MVP): enabled student whose grade equals the exam grade — implemented only in `server/assessment/eligibility.ts`.
- Student payloads never contain correct options, correctness or explanations before the release policy allows.
- Times stored UTC, displayed Asia/Colombo. Student UI defaults to Sinhala.
