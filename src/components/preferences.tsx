"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authApi } from "@/lib/api/student";
import { IconGlobe, IconLogout, IconMoon, IconSun } from "./ui/icons";

const iconBtn = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface";

/** Language and theme toggles (cookie-based, no personal data). Compact on phones. */
export function Preferences({ lang, theme, labels }: { lang: "si" | "en"; theme: "light" | "dark"; labels: { language: string; theme: string; light: string; dark: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`;
    if (k === "ep_theme") document.documentElement.dataset.theme = v;
    start(() => router.refresh());
  };
  const other = lang === "si" ? "English" : "සිංහල";
  return (
    <div className="flex items-center" aria-busy={pending}>
      {/* Accessible name = visible text (WCAG 2.5.3), with a screen-reader-only prefix. */}
      <button type="button" className={iconBtn} onClick={() => set("ep_lang", lang === "si" ? "en" : "si")}>
        <IconGlobe size={18} />
        <span className="sr-only">{labels.language}: </span>
        <span lang={lang === "si" ? "en" : "si"}>{other}</span>
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label={`${labels.theme}: ${theme === "dark" ? labels.light : labels.dark}`}
        aria-pressed={theme === "dark"}
        onClick={() => set("ep_theme", theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
      </button>
    </div>
  );
}

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={iconBtn}
      aria-label={label}
      onClick={async () => {
        await authApi.logout().catch(() => undefined);
        // Shared-device safety: remove any locally kept pending answers.
        try {
          for (const k of Object.keys(localStorage)) if (k.startsWith("ep:")) localStorage.removeItem(k);
          sessionStorage.clear();
        } catch {
          /* storage unavailable */
        }
        router.replace("/login");
        router.refresh();
      }}
    >
      <IconLogout size={18} />
      <span aria-hidden className="hidden sm:inline">
        {label}
      </span>
    </button>
  );
}
