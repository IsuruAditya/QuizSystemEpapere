import { idParams, withRoute } from "@/server/http/route";
import { runStudentCommand, studentCommand, studentUpdate, updateStudent } from "@/server/users/students";

export const runtime = "nodejs";

export const PUT = withRoute({ auth: "admin", body: studentUpdate, params: idParams }, async ({ actor, body, params, requestId }) => {
  await updateStudent(actor, params.id, body, requestId);
  return { ok: true };
});

/** disable | enable | reset-password | pseudonymise */
export const POST = withRoute({ auth: "admin", body: studentCommand, params: idParams }, async ({ actor, body, params, requestId }) => runStudentCommand(actor, params.id, body, requestId));
