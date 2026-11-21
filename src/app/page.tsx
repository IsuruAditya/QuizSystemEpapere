import { redirect } from "next/navigation";
import { currentActor } from "@/server/http/page";

export const dynamic = "force-dynamic";

export default async function Home() {
  const a = await currentActor();
  if (!a) redirect("/login");
  redirect(a.role === "ADMIN" ? "/admin" : "/student");
}
