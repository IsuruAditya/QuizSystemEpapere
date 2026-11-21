import { withRoute } from "@/server/http/route";
import { createStudent, studentInput } from "@/server/users/students";

export const runtime = "nodejs";

/** Create one student; the temporary password is returned once and never stored in plain text. */
export const POST = withRoute({ auth: "admin", body: studentInput }, async ({ actor, body, requestId }) => createStudent(actor, body, requestId));
