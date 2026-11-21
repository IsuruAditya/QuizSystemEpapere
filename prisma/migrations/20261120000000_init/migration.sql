-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('TEACHER_PHOTO', 'EXAM_COVER', 'QUESTION_IMAGE');

-- CreateEnum
CREATE TYPE "ExamMode" AS ENUM ('RANKED', 'PRACTICE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('IMMEDIATE', 'AFTER_RELEASE', 'NEVER');

-- CreateEnum
CREATE TYPE "LeaderboardVisibility" AS ENUM ('STUDENTS', 'HIDDEN');

-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('OFFICIAL', 'PRACTICE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "FinalizeReason" AS ENUM ('MANUAL', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('STAGED', 'COMMITTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "username" TEXT,
    "display_username" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profile" (
    "user_id" TEXT NOT NULL,
    "ep_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "grade_id" UUID NOT NULL,
    "whatsapp_e164" TEXT,
    "school" TEXT,
    "district" TEXT,
    "pseudonymised_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "grade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "level" INTEGER NOT NULL,
    "name_si" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_si" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "photo_media_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "MediaKind" NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT,
    "original_name" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by_id" TEXT NOT NULL,
    "external_id" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "stem" TEXT NOT NULL,
    "stem_media_id" UUID,
    "explanation" TEXT,
    "marks" INTEGER NOT NULL,
    "topic" TEXT,
    "difficulty" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_option" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT,
    "media_id" UUID,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "question_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "grade_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "cover_media_id" UUID,
    "mode" "ExamMode" NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "duration_seconds" INTEGER,
    "opens_at" TIMESTAMPTZ(3),
    "closes_at" TIMESTAMPTZ(3),
    "allow_late_start" BOOLEAN NOT NULL DEFAULT true,
    "max_attempts" INTEGER,
    "score_visibility" "Visibility" NOT NULL DEFAULT 'IMMEDIATE',
    "correctness_visibility" "Visibility" NOT NULL DEFAULT 'AFTER_RELEASE',
    "answer_visibility" "Visibility" NOT NULL DEFAULT 'AFTER_RELEASE',
    "explanation_visibility" "Visibility" NOT NULL DEFAULT 'AFTER_RELEASE',
    "review_release_at" TIMESTAMPTZ(3),
    "leaderboard_visibility" "LeaderboardVisibility" NOT NULL DEFAULT 'STUDENTS',
    "ranking_revision" INTEGER NOT NULL DEFAULT 0,
    "ranking_note" TEXT,
    "current_version_id" UUID,
    "created_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_draft_item" (
    "exam_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_version_id" UUID NOT NULL,

    CONSTRAINT "exam_draft_item_pkey" PRIMARY KEY ("exam_id","position")
);

-- CreateTable
CREATE TABLE "exam_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "total_marks" INTEGER NOT NULL,
    "question_count" INTEGER NOT NULL,
    "latest_grading_revision_id" UUID,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_version_id" UUID NOT NULL,
    "marks" INTEGER NOT NULL,

    CONSTRAINT "exam_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_version_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_key" (
    "grading_revision_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "exam_version_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "correct_option_id" UUID NOT NULL,
    "marks" INTEGER NOT NULL,

    CONSTRAINT "grading_key_pkey" PRIMARY KEY ("grading_revision_id","exam_question_id")
);

-- CreateTable
CREATE TABLE "attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "exam_version_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "AttemptKind" NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "deadline_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "finalize_reason" "FinalizeReason",
    "elapsed_ms" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "controller_token" UUID NOT NULL,
    "last_mutation_id" UUID,
    "last_saved_at" TIMESTAMPTZ(3),
    "score" INTEGER,
    "max_score" INTEGER,
    "percent_bp" INTEGER,
    "grading_revision_id" UUID,
    "graded_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "replacement_granted" BOOLEAN NOT NULL DEFAULT false,
    "replaces_attempt_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answer" (
    "attempt_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "exam_version_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "option_id" UUID,
    "revision" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attempt_answer_pkey" PRIMARY KEY ("attempt_id","exam_question_id")
);

-- CreateTable
CREATE TABLE "attempt_grade" (
    "attempt_id" UUID NOT NULL,
    "grading_revision_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "graded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_grade_pkey" PRIMARY KEY ("attempt_id","grading_revision_id")
);

-- CreateTable
CREATE TABLE "import_job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL DEFAULT 'QUESTIONS_CSV',
    "actor_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "target_exam_id" UUID,
    "status" "ImportStatus" NOT NULL DEFAULT 'STAGED',
    "rows" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "error_count" INTEGER NOT NULL,
    "warning_count" INTEGER NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "dedupe_key" TEXT,
    "progress" JSONB,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_ep_id_key" ON "student_profile"("ep_id");

-- CreateIndex
CREATE INDEX "student_profile_grade_id_idx" ON "student_profile"("grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_level_key" ON "grade"("level");

-- CreateIndex
CREATE UNIQUE INDEX "subject_code_key" ON "subject"("code");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "question_version_question_id_version_no_key" ON "question_version"("question_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "question_option_question_version_id_position_key" ON "question_option"("question_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "question_option_id_question_version_id_key" ON "question_option"("id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_slug_key" ON "exam"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "exam_current_version_id_key" ON "exam"("current_version_id");

-- CreateIndex
CREATE INDEX "exam_status_grade_id_subject_id_idx" ON "exam"("status", "grade_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_draft_item_exam_id_question_version_id_key" ON "exam_draft_item"("exam_id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_version_latest_grading_revision_id_key" ON "exam_version"("latest_grading_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_version_exam_id_version_no_key" ON "exam_version"("exam_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "exam_version_id_exam_id_key" ON "exam_version"("id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_exam_version_id_position_key" ON "exam_question"("exam_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_exam_version_id_question_version_id_key" ON "exam_question"("exam_version_id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_id_exam_version_id_question_version_id_key" ON "exam_question"("id", "exam_version_id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_revision_exam_version_id_revision_no_key" ON "grading_revision"("exam_version_id", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_replaces_attempt_id_key" ON "attempt"("replaces_attempt_id");

-- CreateIndex
CREATE INDEX "attempt_user_id_exam_id_idx" ON "attempt"("user_id", "exam_id");

-- CreateIndex
CREATE INDEX "attempt_exam_id_status_idx" ON "attempt"("exam_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_id_exam_version_id_key" ON "attempt"("id", "exam_version_id");

-- CreateIndex
CREATE INDEX "import_job_actor_id_created_at_idx" ON "import_job"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_dedupe_key_key" ON "job"("dedupe_key");

-- CreateIndex
CREATE INDEX "job_status_run_after_idx" ON "job"("status", "run_after");

-- CreateIndex
CREATE INDEX "audit_event_target_type_target_id_created_at_idx" ON "audit_event"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_created_at_idx" ON "audit_event"("created_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_photo_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_option" ADD CONSTRAINT "question_option_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam" ADD CONSTRAINT "exam_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam" ADD CONSTRAINT "exam_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam" ADD CONSTRAINT "exam_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam" ADD CONSTRAINT "exam_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam" ADD CONSTRAINT "exam_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "exam_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_draft_item" ADD CONSTRAINT "exam_draft_item_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_draft_item" ADD CONSTRAINT "exam_draft_item_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_version" ADD CONSTRAINT "exam_version_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_version" ADD CONSTRAINT "exam_version_latest_grading_revision_id_fkey" FOREIGN KEY ("latest_grading_revision_id") REFERENCES "grading_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question" ADD CONSTRAINT "exam_question_exam_version_id_fkey" FOREIGN KEY ("exam_version_id") REFERENCES "exam_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question" ADD CONSTRAINT "exam_question_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_revision" ADD CONSTRAINT "grading_revision_exam_version_id_fkey" FOREIGN KEY ("exam_version_id") REFERENCES "exam_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_key" ADD CONSTRAINT "grading_key_grading_revision_id_fkey" FOREIGN KEY ("grading_revision_id") REFERENCES "grading_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_key" ADD CONSTRAINT "grading_key_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_exam_version_id_fkey" FOREIGN KEY ("exam_version_id") REFERENCES "exam_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_grading_revision_id_fkey" FOREIGN KEY ("grading_revision_id") REFERENCES "grading_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_replaces_attempt_id_fkey" FOREIGN KEY ("replaces_attempt_id") REFERENCES "attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_grade" ADD CONSTRAINT "attempt_grade_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_grade" ADD CONSTRAINT "attempt_grade_grading_revision_id_fkey" FOREIGN KEY ("grading_revision_id") REFERENCES "grading_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_target_exam_id_fkey" FOREIGN KEY ("target_exam_id") REFERENCES "exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
