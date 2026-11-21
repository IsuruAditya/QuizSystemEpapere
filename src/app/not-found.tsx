import { ButtonLink } from "@/components/ui";
import { getT } from "@/server/http/page";

export default async function NotFound() {
  const { tr } = await getT();
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{tr("notFound")}</h1>
      <ButtonLink className="mt-6" href="/">
        {tr("backToDashboard")}
      </ButtonLink>
    </main>
  );
}
