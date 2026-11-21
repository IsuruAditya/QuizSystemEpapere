import "server-only";
import { db } from "../db";

export async function teacherPhotoOptions(): Promise<{ id: string; label: string }[]> {
  const photos = await db.media.findMany({ where: { kind: "TEACHER_PHOTO" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, altText: true, originalName: true } });
  return photos.map((p) => ({ id: p.id, label: p.altText || p.originalName || p.id.slice(0, 8) }));
}

export async function examFormOptions() {
  const [grades, subjects, teachers, covers] = await Promise.all([
    db.grade.findMany({ where: { active: true }, orderBy: { level: "asc" } }),
    db.subject.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.teacher.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.media.findMany({ where: { kind: "EXAM_COVER" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, originalName: true, altText: true } }),
  ]);
  return {
    grades: grades.map((g) => ({ id: g.id, label: `Grade ${g.level}` })),
    subjects: subjects.map((s) => ({ id: s.id, label: `${s.nameEn} / ${s.nameSi}` })),
    teachers: teachers.map((t) => ({ id: t.id, label: t.name })),
    covers: covers.map((c) => ({ id: c.id, label: c.altText || c.originalName || c.id.slice(0, 8) })),
  };
}
