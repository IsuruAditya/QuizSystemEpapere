import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Alert } from "@/components/ui";
import { currentActor, getT } from "@/server/http/page";
import { safeReturnTo } from "@/lib/return-to";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const actor = await currentActor();
  const { returnTo } = await searchParams;
  if (!actor) redirect("/login");
  const { tr } = await getT();
  const next = safeReturnTo(returnTo) === "/" ? (actor.role === "ADMIN" ? "/admin" : "/student") : safeReturnTo(returnTo);
  return (
    <>
      <AppHeader actor={actor} />
      <main id="main" className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold">{tr("changePassword")}</h1>
        {actor.mustChangePassword && (
          <Alert kind="warn" className="mt-4">
            {tr("mustChangePassword")}
          </Alert>
        )}
        <PasswordForm
          next={next}
          labels={{ current: tr("currentPassword"), next: tr("newPassword"), confirm: tr("confirmPassword"), differ: tr("passwordsDiffer"), save: tr("save"), done: tr("passwordChanged"), error: tr("somethingWrong") }}
        />
      </main>
    </>
  );
}
