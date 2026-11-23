import Link from "next/link";
import { cookies } from "next/headers";
import { getT } from "@/server/http/page";
import type { Actor } from "@/server/auth/actor";
import { DesktopNav, MobileNav, type NavItem } from "./nav";
import { Preferences, SignOutButton } from "./preferences";

/** Brand mark: teal tile with initials (decorative; the product name is the link text). */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-xl bg-brand text-sm font-bold text-brand-fg shadow-sm" style={{ width: size, height: size }}>
      eP
    </span>
  );
}

/** Sticky single-row header on every screen size; sections collapse into a menu below lg. */
export async function AppHeader({ actor, nav }: { actor: Actor | null; nav?: NavItem[] }) {
  const { lang, tr } = await getT();
  const theme = (await cookies()).get("ep_theme")?.value === "dark" ? "dark" : "light";
  const hasNav = Boolean(nav && nav.length);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-5">
        {hasNav && <MobileNav items={nav!} label={tr("mainNav")} openLabel={tr("openMenu")} closeLabel={tr("closeMenu")} />}
        <Link href={actor?.role === "ADMIN" ? "/admin" : actor ? "/student" : "/login"} className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl pr-2">
          <BrandMark />
          {/* With the menu button present, phones show only the mark; the name stays for screen readers. */}
          <span className={`truncate font-display text-base font-bold text-fg ${hasNav ? "sr-only sm:not-sr-only" : ""}`}>{tr("appName")}</span>
        </Link>
        {hasNav && (
          <div className="ml-4">
            <DesktopNav items={nav!} label={tr("mainNav")} />
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          <Preferences lang={lang} theme={theme} labels={{ language: tr("language"), theme: tr("theme"), light: tr("themeLight"), dark: tr("themeDark") }} />
          {actor && <SignOutButton label={tr("signOut")} />}
        </div>
      </div>
    </header>
  );
}
