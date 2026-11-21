"use client";
import { api } from "../api-client";

/** Typed client calls for admin screens. Components never call fetch directly. */

export type ExamCommand = "publish" | "unpublish" | "archive" | "duplicate";

export interface ExamSettingsBody {
  title: string;
  description: string;
  instructions: string;
  gradeId: string;
  subjectId: string;
  teacherId: string | null;
  coverMediaId: string | null;
  mode: "RANKED" | "PRACTICE";
  durationMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  allowLateStart: boolean;
  maxAttempts: number | null;
  scoreVisibility: string;
  correctnessVisibility: string;
  answerVisibility: string;
  explanationVisibility: string;
  reviewReleaseAt: string | null;
  leaderboardVisibility: string;
}

export interface QuestionBody {
  stem: string;
  stemMediaId: string | null;
  options: { text: string | null; mediaId: string | null }[];
  correctIndex: number;
  marks: number;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
}

export interface BankItem {
  id: string;
  versionId: string;
  stem: string;
  marks: number;
  externalId: string | null;
}

export interface StudentBody {
  epId: string;
  fullName: string;
  displayName: string;
  gradeId: string;
  whatsapp: string;
  school: string;
  district: string;
}

export interface BulkResult {
  committed: boolean;
  errorCount: number;
  results: { rowNumber: number; epId: string; errors: string[] }[];
  credentials: { epId: string; temporaryPassword: string }[];
}

export const examsApi = {
  create: (b: ExamSettingsBody) => api<{ id: string }>("/api/v1/admin/exams", { body: b }),
  update: (id: string, b: ExamSettingsBody) => api<{ ok: true }>(`/api/v1/admin/exams/${id}`, { method: "PUT", body: b }),
  command: (id: string, c: ExamCommand) => api<{ ok: true; id?: string }>(`/api/v1/admin/exams/${id}/${c}`, { method: "POST" }),
  setQuestions: (id: string, questionVersionIds: string[]) => api<{ ok: true }>(`/api/v1/admin/exams/${id}/questions`, { method: "PUT", body: { questionVersionIds } }),
  correctKey: (id: string, b: { reason: string; adminPassword: string; changes: { examQuestionId: string; correctOptionId: string }[] }) =>
    api<{ revisionNo: number }>(`/api/v1/admin/exams/${id}/grading-corrections`, { body: b }),
  voidAttempt: (attemptId: string, b: { reason: string; grantReplacement: boolean; adminPassword: string }) => api<{ ok: true }>(`/api/v1/admin/attempts/${attemptId}/void`, { body: b }),
};

export const questionsApi = {
  create: (question: QuestionBody, externalId: string | null, addToExamId: string | null) =>
    api<{ questionId: string; versionId: string; warnings: string[] }>("/api/v1/admin/questions", { body: { question, externalId, addToExamId } }),
  update: (id: string, question: QuestionBody) => api<{ questionId: string; versionId: string; warnings: string[] }>(`/api/v1/admin/questions/${id}`, { method: "PUT", body: { question } }),
  search: (q: string) => api<{ items: BankItem[] }>(`/api/v1/admin/questions?search=${encodeURIComponent(q)}&pageSize=20`),
};

export const importsApi = {
  upload: <T>(form: FormData) => api<T>("/api/v1/admin/imports", { form, timeoutMs: 60_000 }),
  revalidate: <T>(id: string, rows: object[], removeRowNumbers: number[]) => api<T>(`/api/v1/admin/imports/${id}`, { method: "PATCH", body: { rows, removeRowNumbers } }),
  commit: (id: string, allowDuplicate: boolean) => api<{ questionVersionIds: string[] }>(`/api/v1/admin/imports/${id}`, { body: { action: "commit", allowDuplicate } }),
  discard: (id: string) => api<{ ok: true }>(`/api/v1/admin/imports/${id}`, { body: { action: "discard" } }),
};

export const mediaApi = {
  upload: (form: FormData) => api<{ id: string }>("/api/v1/admin/media", { form, timeoutMs: 60_000 }),
  setAlt: (id: string, altText: string) => api<{ ok: true }>("/api/v1/admin/media", { method: "PATCH", body: { id, altText } }),
};

export const studentsApi = {
  create: (b: StudentBody) => api<{ epId: string; temporaryPassword: string }>("/api/v1/admin/students", { body: b }),
  update: (id: string, b: Omit<StudentBody, "epId">) => api<{ ok: true }>(`/api/v1/admin/students/${id}`, { method: "PUT", body: b }),
  command: (id: string, b: { action: "disable" | "enable" } | { action: "reset-password" | "pseudonymise"; adminPassword: string }) =>
    api<{ ok: true; temporaryPassword?: string }>(`/api/v1/admin/students/${id}`, { body: b }),
  bulk: (file: File, commit: boolean) => {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("commit", commit ? "1" : "0");
    return api<BulkResult>("/api/v1/admin/students/bulk", { form: fd, timeoutMs: 90_000 });
  },
};

export const catalogApi = {
  save: (kind: string, id: string | null, data: Record<string, unknown>) => api<{ ok: true; id?: string }>(`/api/v1/admin/catalog/${kind}`, { body: { id, data } }),
};
