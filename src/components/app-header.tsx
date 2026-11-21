import Link from "next/link";
import { cookies } from "next/headers";
import { getT } from "@/server/http/page";
import type { Actor } from "@/server/auth/actor";
import { Preferences, SignOutButton } from "./preferences";

export async function AppHeader({ actor, nav }: { actor: Actor | null; nav?: { href: string; label: string }[] }) {
  const { lang, tr } = await getT();
  const theme = (await cookies()).get("ep_theme")?.value === "dark" ? "dark" : "light";
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <Link href={actor?.role === "ADMIN" ? "/admin" : "/student"} className="flex min-h-11 items-center gap-2 font-bold text-brand">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand text-sm text-brand-fg">eP</span>
          <span>{tr("appName")}</span>
        </Link>
        {nav && nav.length > 0 && (
          <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="min-h-11 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-surface-2">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-1">
          <Preferences lang={lang} theme={theme} labels={{ language: tr("language"), theme: tr("theme"), light: tr("themeLight"), dark: tr("themeDark") }} />
          {actor && <SignOutButton label={tr("signOut")} />}
        </div>
      </div>
    </header>
  );
}
