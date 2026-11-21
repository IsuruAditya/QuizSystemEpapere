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
      <main id="main" className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold">{tr("signIn")}</h1>
        <p className="mt-1 text-muted">{tr("institute")}</p>
        <LoginForm
          returnTo={safeReturnTo(returnTo)}
          labels={{ id: tr("studentId"), idHint: tr("studentIdHint"), password: tr("password"), submit: tr("signIn"), submitting: tr("signingIn"), failed: tr("loginFailed"), tooMany: tr("tooManyAttempts"), error: tr("somethingWrong") }}
        />
        <p className="mt-6 text-sm text-muted">{tr("forgotPassword")}</p>
      </main>
    </>
  );
}
