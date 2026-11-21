import { CatalogRow } from "@/components/admin/catalog-forms";
import { Card, PageHeader } from "@/components/ui";
import { getBranding, listCatalog } from "@/server/catalog/catalog";
import { teacherPhotoOptions } from "@/server/catalog/form-options";

export default async function Settings() {
  const [c, b, photoOpts] = await Promise.all([listCatalog(), getBranding(), teacherPhotoOptions()]);
  const gradeF = [
    { key: "level", label: "Level", type: "number" as const },
    { key: "nameSi", label: "Sinhala name" },
    { key: "nameEn", label: "English name" },
    { key: "active", label: "Active", type: "checkbox" as const },
  ];
  const subjectF = [{ key: "code", label: "Code" }, { key: "nameSi", label: "Sinhala name" }, { key: "nameEn", label: "English name" }, { key: "active", label: "Active", type: "checkbox" as const }];
  const teacherF = [{ key: "name", label: "Name" }, { key: "bio", label: "Short bio" }, { key: "photoMediaId", label: "Photo (upload under Media)", type: "select" as const, options: photoOpts }, { key: "active", label: "Active", type: "checkbox" as const }];
  return (
    <>
      <PageHeader title="Settings" subtitle="Catalog data and branding. Secrets are configured as environment variables, never here." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Branding</h2>
          <CatalogRow kind="branding" id={null} submitLabel="Save" fields={[{ key: "instituteName", label: "Institute name" }, { key: "tagline", label: "Tagline" }]} initial={b} />
          <p className="mt-2 text-xs text-muted">Interface languages: Sinhala (student default) and English.</p>
        </Card>
        <Card>
          <h2 className="font-bold">Grades</h2>
          {c.grades.map((g) => (
            <CatalogRow key={g.id} kind="grade" id={g.id} submitLabel="Save" fields={gradeF} initial={{ level: g.level, nameSi: g.nameSi, nameEn: g.nameEn, active: g.active }} />
          ))}
          <CatalogRow kind="grade" id={null} submitLabel="Add" fields={gradeF} initial={{ level: 12, nameSi: "", nameEn: "", active: true }} />
        </Card>
        <Card>
          <h2 className="font-bold">Subjects</h2>
          {c.subjects.map((s) => (
            <CatalogRow key={s.id} kind="subject" id={s.id} submitLabel="Save" fields={subjectF} initial={{ code: s.code, nameSi: s.nameSi, nameEn: s.nameEn, active: s.active }} />
          ))}
          <CatalogRow kind="subject" id={null} submitLabel="Add" fields={subjectF} initial={{ code: "", nameSi: "", nameEn: "", active: true }} />
        </Card>
        <Card>
          <h2 className="font-bold">Teachers</h2>
          {c.teachers.map((t) => (
            <CatalogRow key={t.id} kind="teacher" id={t.id} submitLabel="Save" fields={teacherF} initial={{ name: t.name, bio: t.bio ?? "", photoMediaId: t.photoMediaId, active: t.active }} />
          ))}
          <CatalogRow kind="teacher" id={null} submitLabel="Add" fields={teacherF} initial={{ name: "", bio: "", photoMediaId: null, active: true }} />
        </Card>
      </div>
    </>
  );
}
