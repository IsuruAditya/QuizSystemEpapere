-- Invariants Prisma's schema language cannot express. See design.md §2 and ADR-002.

-- ── Question content ──
ALTER TABLE "question_version" ADD CONSTRAINT "qv_marks_positive" CHECK ("marks" BETWEEN 1 AND 100);
ALTER TABLE "question_version" ADD CONSTRAINT "qv_version_positive" CHECK ("version_no" >= 1);
ALTER TABLE "question_option" ADD CONSTRAINT "qo_position_range" CHECK ("position" BETWEEN 0 AND 3);
ALTER TABLE "question_option" ADD CONSTRAINT "qo_has_content" CHECK ("text" IS NOT NULL OR "media_id" IS NOT NULL);
CREATE UNIQUE INDEX "qo_one_correct_per_version" ON "question_option" ("question_version_id") WHERE "is_correct";

-- ── Exams ──
ALTER TABLE "exam" ADD CONSTRAINT "exam_duration_range" CHECK ("duration_seconds" IS NULL OR "duration_seconds" BETWEEN 60 AND 36000);
ALTER TABLE "exam" ADD CONSTRAINT "exam_window_order" CHECK ("opens_at" IS NULL OR "closes_at" IS NULL OR "opens_at" < "closes_at");
ALTER TABLE "exam" ADD CONSTRAINT "exam_max_attempts" CHECK ("max_attempts" IS NULL OR "max_attempts" >= 1);
-- A published ranked exam must have a close time and a finite duration.
ALTER TABLE "exam" ADD CONSTRAINT "exam_ranked_requires_window" CHECK (
  "mode" <> 'RANKED' OR "status" = 'DRAFT' OR ("closes_at" IS NOT NULL AND "duration_seconds" IS NOT NULL));
ALTER TABLE "exam" ADD CONSTRAINT "exam_published_has_version" CHECK ("status" = 'DRAFT' OR "current_version_id" IS NOT NULL);
-- The current version must belong to this exam.
ALTER TABLE "exam" ADD CONSTRAINT "exam_current_version_owner"
  FOREIGN KEY ("current_version_id", "id") REFERENCES "exam_version" ("id", "exam_id") ON DELETE RESTRICT;

ALTER TABLE "exam_question" ADD CONSTRAINT "eq_marks_positive" CHECK ("marks" BETWEEN 1 AND 100);
ALTER TABLE "exam_version" ADD CONSTRAINT "ev_totals" CHECK ("total_marks" >= 1 AND "question_count" >= 1);

-- Grading revisions/keys must stay inside one exam version.
ALTER TABLE "grading_revision" ADD CONSTRAINT "gr_id_version_uniq" UNIQUE ("id", "exam_version_id");
ALTER TABLE "grading_key" ADD CONSTRAINT "gk_revision_version"
  FOREIGN KEY ("grading_revision_id", "exam_version_id") REFERENCES "grading_revision" ("id", "exam_version_id") ON DELETE RESTRICT;
ALTER TABLE "grading_key" ADD CONSTRAINT "gk_slot_membership"
  FOREIGN KEY ("exam_question_id", "exam_version_id", "question_version_id")
  REFERENCES "exam_question" ("id", "exam_version_id", "question_version_id") ON DELETE RESTRICT;
ALTER TABLE "grading_key" ADD CONSTRAINT "gk_option_membership"
  FOREIGN KEY ("correct_option_id", "question_version_id") REFERENCES "question_option" ("id", "question_version_id") ON DELETE RESTRICT;
ALTER TABLE "grading_key" ADD CONSTRAINT "gk_marks_positive" CHECK ("marks" BETWEEN 1 AND 100);
ALTER TABLE "exam_version" ADD CONSTRAINT "ev_latest_revision_owner"
  FOREIGN KEY ("latest_grading_revision_id", "id") REFERENCES "grading_revision" ("id", "exam_version_id") ON DELETE RESTRICT;

-- ── Attempts ──
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_version_owner"
  FOREIGN KEY ("exam_version_id", "exam_id") REFERENCES "exam_version" ("id", "exam_id") ON DELETE RESTRICT;
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_revision_owner"
  FOREIGN KEY ("grading_revision_id", "exam_version_id") REFERENCES "grading_revision" ("id", "exam_version_id") ON DELETE RESTRICT;
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_official_has_deadline" CHECK ("kind" <> 'OFFICIAL' OR "deadline_at" IS NOT NULL);
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_deadline_after_start" CHECK ("deadline_at" IS NULL OR "deadline_at" > "started_at");
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_revision_nonneg" CHECK ("revision" >= 0);
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_finalized_fields" CHECK (
  "status" = 'IN_PROGRESS'
  OR ("submitted_at" IS NOT NULL AND "finalize_reason" IS NOT NULL AND "elapsed_ms" IS NOT NULL AND "elapsed_ms" >= 0));
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_graded_fields" CHECK (
  ("status" = 'GRADED') = ("score" IS NOT NULL AND "max_score" IS NOT NULL AND "percent_bp" IS NOT NULL AND "grading_revision_id" IS NOT NULL AND "graded_at" IS NOT NULL));
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= "max_score"));
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_void_reason" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL));

-- At most one non-void OFFICIAL attempt per student and exam (covers in-progress, submitted, graded).
CREATE UNIQUE INDEX "attempt_one_official" ON "attempt" ("exam_id", "user_id") WHERE "kind" = 'OFFICIAL' AND "voided_at" IS NULL;
-- At most one in-progress attempt per student and exam (concurrent starts resume the same attempt).
CREATE UNIQUE INDEX "attempt_one_in_progress" ON "attempt" ("exam_id", "user_id") WHERE "status" = 'IN_PROGRESS';
-- Leaderboard: filter by exam first, then ordered by score/time (ADR-006).
CREATE INDEX "attempt_ranking" ON "attempt" ("exam_id", "score" DESC, "elapsed_ms" ASC, "id")
  WHERE "kind" = 'OFFICIAL' AND "status" = 'GRADED' AND "voided_at" IS NULL;
-- Expiry reconciliation scan.
CREATE INDEX "attempt_expiry_scan" ON "attempt" ("deadline_at") WHERE "status" = 'IN_PROGRESS' AND "deadline_at" IS NOT NULL;

-- ── Answers: provable membership in the attempt's exam version ──
ALTER TABLE "attempt_answer" ADD CONSTRAINT "aa_attempt_version"
  FOREIGN KEY ("attempt_id", "exam_version_id") REFERENCES "attempt" ("id", "exam_version_id") ON DELETE RESTRICT;
ALTER TABLE "attempt_answer" ADD CONSTRAINT "aa_slot_membership"
  FOREIGN KEY ("exam_question_id", "exam_version_id", "question_version_id")
  REFERENCES "exam_question" ("id", "exam_version_id", "question_version_id") ON DELETE RESTRICT;
ALTER TABLE "attempt_answer" ADD CONSTRAINT "aa_option_membership"
  FOREIGN KEY ("option_id", "question_version_id") REFERENCES "question_option" ("id", "question_version_id") ON DELETE RESTRICT;

ALTER TABLE "attempt_grade" ADD CONSTRAINT "ag_score_range" CHECK ("score" >= 0 AND "score" <= "max_score");

-- ── Jobs ──
CREATE INDEX "job_claim" ON "job" ("run_after") WHERE "status" IN ('QUEUED', 'RUNNING');
ALTER TABLE "job" ADD CONSTRAINT "job_attempts_range" CHECK ("attempts" >= 0 AND "max_attempts" >= 1);

-- ── Student profile ──
ALTER TABLE "student_profile" ADD CONSTRAINT "sp_ep_id_format" CHECK ("ep_id" ~ '^EP[0-9A-Z]{3,15}$');
