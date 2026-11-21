import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveActor, type Actor } from "../auth/actor";
import { t, type Lang } from "@/lib/i18n/dictionaries";
import { safeReturnTo } from "@/lib/return-to";

export { safeReturnTo };

/** Language preference from cookie; Sinhala by default. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("ep_lang")?.value;
  return c === "en" ? "en" : "si";
}

export async function getT() {
  const lang = await getLang();
  return { lang, tr: t(lang) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fail fast on malformed route ids in pages: render 404 instead of letting the DB reject it. */
export function requireUuid(v: string): string {
  if (!UUID.test(v)) notFound();
  return v;
}

export async function currentActor(): Promise<Actor | null> {
  return resolveActor(await headers());
}

/** Page guard: redirects to login (with safe return URL) or to password change. */
export async function requirePage(role: "STUDENT" | "ADMIN" | "ANY", returnTo: string): Promise<Actor> {
  const a = await currentActor();
  if (!a) redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  if (a.mustChangePassword) redirect(`/account/password?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  if (role !== "ANY" && a.role !== role) redirect(a.role === "ADMIN" ? "/admin" : "/student");
  return a;
}
