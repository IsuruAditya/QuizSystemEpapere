/** Student-safe attempt DTO types shared by server and client (no answer keys by construction). */
export interface MediaRef {
  id: string;
  alt: string | null;
  width: number;
  height: number;
}
export interface OptionView {
  id: string;
  position: number;
  text: string | null;
  media: MediaRef | null;
}
export interface QuestionView {
  examQuestionId: string;
  position: number;
  marks: number;
  stem: string;
  media: MediaRef | null;
  options: OptionView[];
}
export interface AttemptView {
  id: string;
  exam: { id: string; slug: string; title: string; mode: "RANKED" | "PRACTICE"; teacherName: string | null; teacherPhotoId: string | null };
  kind: "OFFICIAL" | "PRACTICE";
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  voided: boolean;
  startedAt: string;
  deadlineAt: string | null;
  serverTime: string;
  revision: number;
  lastSavedAt: string | null;
  totalMarks: number;
  questions: QuestionView[];
  answers: Record<string, string | null>;
}
