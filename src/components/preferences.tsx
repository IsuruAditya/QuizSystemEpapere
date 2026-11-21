"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authApi } from "@/lib/api/student";

/** Language and theme toggles (cookie-based, no personal data). */
export function Preferences({ lang, theme, labels }: { lang: "si" | "en"; theme: "light" | "dark"; labels: { language: string; theme: string; light: string; dark: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`;
    if (k === "ep_theme") document.documentElement.dataset.theme = v;
    start(() => router.refresh());
  };
  return (
    <div className="flex items-center gap-1" aria-busy={pending}>
      <button
        type="button"
        className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-surface-2"
        aria-label={`${labels.language}: ${lang === "si" ? "English" : "සිංහල"}`}
        lang={lang === "si" ? "en" : "si"}
        onClick={() => set("ep_lang", lang === "si" ? "en" : "si")}
      >
        {lang === "si" ? "English" : "සිංහල"}
      </button>
      <button
        type="button"
        className="min-h-11 min-w-11 rounded-lg px-2 text-lg hover:bg-surface-2"
        aria-label={`${labels.theme}: ${theme === "dark" ? labels.light : labels.dark}`}
        aria-pressed={theme === "dark"}
        onClick={() => set("ep_theme", theme === "dark" ? "light" : "dark")}
      >
        <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
      </button>
    </div>
  );
}

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-surface-2"
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
      {label}
    </button>
  );
}
