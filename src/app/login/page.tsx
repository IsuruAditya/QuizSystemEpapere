import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { currentActor, getT } from "@/server/http/page";
import { safeReturnTo } from "@/lib/return-to";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  const actor = await currentActor();
  if (actor && !actor.mustChangePassword) redirect(safeReturnTo(returnTo) === "/" ? (actor.role === "ADMIN" ? "/admin" : "/student") : safeReturnTo(returnTo));
  const { tr } = await getT();
  return (
    <>
      <AppHeader actor={null} />
      <main id="main" className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-6 px-4 py-6 sm:py-10 lg:grid-cols-2 lg:gap-12">
        <section className="hero overflow-hidden rounded-3xl p-6 shadow-card sm:p-10" aria-labelledby="brand-title">
          <p className="text-sm font-semibold text-white/85">{tr("institute")}</p>
          <h2 id="brand-title" className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">
            {tr("loginTagline")}
          </h2>
          <p className="mt-3 hidden text-white/90 sm:block">{tr("loginPoints")}</p>
        </section>
        <section className="rounded-3xl border border-border bg-bg p-6 shadow-card sm:p-8" aria-labelledby="signin-title">
          <p className="text-sm font-semibold text-brand">{tr("loginWelcome")}</p>
          <h1 id="signin-title" className="mt-1 text-2xl font-bold sm:text-3xl">
            {tr("signIn")}
          </h1>
          <LoginForm
            returnTo={safeReturnTo(returnTo)}
            labels={{ id: tr("studentId"), idHint: tr("studentIdHint"), password: tr("password"), submit: tr("signIn"), submitting: tr("signingIn"), failed: tr("loginFailed"), tooMany: tr("tooManyAttempts"), error: tr("somethingWrong") }}
          />
          <p className="mt-6 border-t border-border pt-4 text-sm text-muted">{tr("forgotPassword")}</p>
        </section>
      </main>
    </>
  );
}
