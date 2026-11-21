import { AppHeader } from "@/components/app-header";
import { requirePage } from "@/server/http/page";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/exams", label: "Exams" },
  { href: "/admin/questions", label: "Question bank" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage("ADMIN", "/admin");
  return (
    <div lang="en">
      <AppHeader actor={actor} nav={NAV} />
      <main id="main" className="mx-auto max-w-6xl px-3 py-6 sm:px-5">
        {children}
      </main>
    </div>
  );
}
